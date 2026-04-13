import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchICSFromURL, parseICSFile, parseICSFileAsTasks } from '@/lib/ics-parser';

const MINIMAL_SINGLE_EVENT = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTAMP:20260101T000000Z
DTSTART:20260415T140000Z
DTEND:20260415T160000Z
SUMMARY:Work block
DESCRIPTION:Details here
END:VEVENT
END:VCALENDAR
`;

describe('parseICSFile', () => {
  it('parses a single timed event', () => {
    const events = parseICSFile(MINIMAL_SINGLE_EVENT);
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Work block');
    expect(events[0].description).toBe('Details here');
    expect(events[0].isScheduled).toBe(false);
    expect(events[0].start.getUTCHours()).toBe(14);
    expect(events[0].end.getTime()).toBeGreaterThan(events[0].start.getTime());
  });

  it('throws on garbage input', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseICSFile('not a calendar')).toThrow(/Failed to parse ICS file/i);
    err.mockRestore();
  });
});

describe('parseICSFileAsTasks', () => {
  it('maps events to tasks with duration and due date', () => {
    const tasks = parseICSFileAsTasks(MINIMAL_SINGLE_EVENT);
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Work block');
    expect(tasks[0].estimatedDuration).toBe(120);
    expect(tasks[0].priority).toBe('medium');
    expect(tasks[0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('detects high priority from categories', () => {
    const ics = MINIMAL_SINGLE_EVENT.replace(
      'SUMMARY:Work block',
      'CATEGORIES:HIGH\nSUMMARY:Urgent'
    );
    const tasks = parseICSFileAsTasks(ics);
    expect(tasks[0].priority).toBe('high');
  });
});

describe('fetchICSFromURL', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('proxies fetch and parses body as ICS', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => MINIMAL_SINGLE_EVENT,
    })) as unknown as typeof fetch;

    const events = await fetchICSFromURL('https://example.com/cal.ics');
    expect(events.length).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalled();
    const url = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain('/api/ics/proxy');
    expect(url).toContain(encodeURIComponent('https://example.com/cal.ics'));
  });

  it('throws when proxy returns error status', async () => {
    const ce = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({ error: 'upstream failed' }),
    })) as unknown as typeof fetch;

    await expect(fetchICSFromURL('https://bad.example/x.ics')).rejects.toThrow(/upstream failed/);
    ce.mockRestore();
  });
});
