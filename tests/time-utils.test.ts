import { describe, expect, it } from 'vitest';
import { formatMinutesToHoursMinutes, parseHoursMinutesToMinutes } from '@/lib/time-utils';

describe('formatMinutesToHoursMinutes', () => {
  it('formats zero', () => {
    expect(formatMinutesToHoursMinutes(0)).toBe('0 minutes');
  });

  it('formats minutes only', () => {
    expect(formatMinutesToHoursMinutes(45)).toBe('45 minutes');
    expect(formatMinutesToHoursMinutes(1)).toBe('1 minute');
  });

  it('formats hours only', () => {
    expect(formatMinutesToHoursMinutes(60)).toBe('1 hour');
    expect(formatMinutesToHoursMinutes(120)).toBe('2 hours');
  });

  it('formats hours and minutes', () => {
    expect(formatMinutesToHoursMinutes(90)).toBe('1 hour 30 minutes');
    expect(formatMinutesToHoursMinutes(615)).toBe('10 hours 15 minutes');
  });

  it('clamps negative to zero', () => {
    expect(formatMinutesToHoursMinutes(-500)).toBe('0 minutes');
  });

  it('handles very large values', () => {
    const s = formatMinutesToHoursMinutes(100_000);
    expect(s).toContain('hours');
    expect(s).not.toContain('NaN');
  });
});

describe('parseHoursMinutesToMinutes', () => {
  it('parses compact h/m notation', () => {
    expect(parseHoursMinutesToMinutes('2h 30m')).toBe(150);
    expect(parseHoursMinutesToMinutes('1h')).toBe(60);
    expect(parseHoursMinutesToMinutes('45m')).toBe(45);
  });

  it('parses verbose strings aligned with formatter output', () => {
    expect(parseHoursMinutesToMinutes('1 hour 30 minutes')).toBe(90);
    expect(parseHoursMinutesToMinutes('2 hours')).toBe(120);
    expect(parseHoursMinutesToMinutes('1 minute')).toBe(1);
  });

  it('returns 0 for empty or unparseable input', () => {
    expect(parseHoursMinutesToMinutes('')).toBe(0);
    expect(parseHoursMinutesToMinutes('   ')).toBe(0);
    expect(parseHoursMinutesToMinutes('hello')).toBe(0);
  });
});
