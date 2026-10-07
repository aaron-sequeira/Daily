import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/db';
import { makeTestDb } from '../db/testDb';

// The minute task glues native calls together; everything around it is swapped for test doubles.
const h = vi.hoisted(() => ({ db: null as unknown as Db, loadFails: false, chipFails: false }));
vi.mock('react-native', () => ({ AppState: { currentState: 'background' } }));
vi.mock('../../modules/daily-native', () => ({
  default: {
    isInCall: () => false, takeBubbleActions: () => [], canDrawOverlays: () => false, bubbleHiddenDay: () => '',
    hasUsageAccess: () => true, updateBubble: vi.fn(), showBubbleSpeech: vi.fn(),
    updateChip: vi.fn(() => { if (h.chipFails) throw new Error('chip gone'); })
  }
}));
vi.mock('../db/expoDb', () => ({ getDb: () => h.db }));
vi.mock('../tracking/runSync', () => ({ runSync: vi.fn(async () => 'ok') }));
vi.mock('../report/run', () => ({ runReportWriter: vi.fn(async () => {}) }));
vi.mock('../reminders/expoNotifier', () => ({ expoNotifier: {} }));
vi.mock('../coach/coach', () => ({ coachTick: vi.fn(async () => {}) }));
vi.mock('../today/load', async (orig) => {
  const real = await orig<typeof import('../today/load')>();
  return { loadToday: (db: Db, now: number) => { if (h.loadFails) throw new Error('bad row'); return real.loadToday(db, now); } };
});

const { minuteTask } = await import('./minuteTask');
const { runReportWriter } = await import('../report/run');
const DailyNative = (await import('../../modules/daily-native')).default;

describe('minuteTask', () => {
  beforeEach(async () => {
    h.db = await makeTestDb();
    h.loadFails = false;
    h.chipFails = false;
    vi.mocked(runReportWriter).mockClear();
    vi.mocked(DailyNative.updateChip).mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('updates the chip and runs the report writer', async () => {
    await minuteTask();
    expect(DailyNative.updateChip).toHaveBeenCalledTimes(1);
    expect(runReportWriter).toHaveBeenCalledWith({ retryFailed: false });
  });

  it('still runs the report writer when loading today throws', async () => {
    h.loadFails = true;
    await minuteTask();
    expect(DailyNative.updateChip).not.toHaveBeenCalled();
    expect(runReportWriter).toHaveBeenCalledTimes(1);
  });

  it('still runs the report writer when the chip update throws', async () => {
    h.chipFails = true;
    await minuteTask();
    expect(runReportWriter).toHaveBeenCalledTimes(1);
  });
});
