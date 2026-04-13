import { describe, expect, it } from 'vitest';
import {
  endOfLocalCalendarDay,
  formatDateToLocalISO,
  parseLocalDateInput,
} from '@/lib/date-utils';

describe('parseLocalDateInput', () => {
  it('parses YYYY-MM-DD as local midnight', () => {
    const d = parseLocalDateInput('2026-06-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('handles leap year February 29', () => {
    const d = parseLocalDateInput('2024-02-29');
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });

  it('returns NaN date for invalid input', () => {
    expect(Number.isNaN(parseLocalDateInput('').getTime())).toBe(true);
    expect(Number.isNaN(parseLocalDateInput('not-a-date').getTime())).toBe(true);
    expect(Number.isNaN(parseLocalDateInput('2026-00-15').getTime())).toBe(true);
  });
});

describe('formatDateToLocalISO', () => {
  it('formats local calendar date', () => {
    const d = new Date(2026, 2, 7, 15, 30, 0);
    expect(formatDateToLocalISO(d)).toBe('2026-03-07');
  });

  it('pads month and day', () => {
    const d = new Date(2026, 0, 5);
    expect(formatDateToLocalISO(d)).toBe('2026-01-05');
  });
});

describe('endOfLocalCalendarDay', () => {
  it('returns 23:59:59.999 local on same calendar day', () => {
    const start = parseLocalDateInput('2026-04-12');
    const end = endOfLocalCalendarDay(start);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(3);
    expect(end.getDate()).toBe(12);
  });
});
