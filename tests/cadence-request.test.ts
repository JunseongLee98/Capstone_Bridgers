import { describe, expect, it } from 'vitest';
import { cadenceRequest } from '@/lib/cadence-request';

describe('cadenceRequest', () => {
  it('throws when Chrome extension APIs are unavailable', async () => {
    await expect(cadenceRequest({ type: 'CADENCE_GET_ENV' })).rejects.toThrow(
      /Cadence extension API is only available inside the extension/i
    );
  });
});
