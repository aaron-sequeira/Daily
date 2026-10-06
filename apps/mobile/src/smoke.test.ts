import { describe, expect, it } from 'vitest';
import { localDate } from '@worksight/core/date';

describe('harness', () => {
  it('imports @worksight/core and runs in Asia/Kolkata', () => {
    // 20:00 UTC on 5 Oct is 01:30 on 6 Oct in India.
    expect(localDate(Date.UTC(2026, 9, 5, 20, 0))).toBe('2026-10-06');
  });
});
