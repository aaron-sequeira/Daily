import { describe, expect, it, vi } from 'vitest';
vi.mock('../../modules/daily-native/screenTime', () => ({ screenTime: null, ScreenTimeReport: null }));
import { waterJson } from './live';

const base = { message: 'Have a few sips.', animation: 'water' as const, breakSec: 0, enabled: true };

describe('waterJson', () => {
  it('hands the enabled water reminder to the ActivityMonitor', () => {
    expect(JSON.parse(waterJson([{ ...base, id: 4, builtin: 'water', name: 'Water', schedule: { type: 'interval', minutes: 60 } }])))
      .toEqual({ reminderId: 4, minutes: 60, title: 'Water', body: 'Have a few sips.' });
  });
  it('is empty when water is off or missing', () => {
    expect(waterJson([{ ...base, id: 4, builtin: 'water', name: 'Water', enabled: false, schedule: { type: 'interval', minutes: 60 } }])).toBe('');
    expect(waterJson([])).toBe('');
  });
});
