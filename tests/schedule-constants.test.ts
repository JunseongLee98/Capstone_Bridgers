import { describe, expect, it } from 'vitest';
import { SCHEDULE_MAX_HORIZON_DAYS } from '@/lib/schedule-constants';

describe('schedule-constants', () => {
  it('exports a positive horizon cap in days', () => {
    expect(SCHEDULE_MAX_HORIZON_DAYS).toBeGreaterThanOrEqual(14);
    expect(SCHEDULE_MAX_HORIZON_DAYS).toBeLessThanOrEqual(366 * 2);
  });
});
