import { describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import { serviceWanted, syncSunnyService } from './service';

const fake = () => ({ startSunnyService: vi.fn(), stopSunnyService: vi.fn() });

describe('Sunny service', () => {
  it('runs only after onboarding and while the user has it on (Review Focus 1 & 5)', async () => {
    const db = await makeTestDb();
    expect(serviceWanted(db)).toBe(false); // not onboarded
    setSetting(db, 'onboarded', '1');
    expect(serviceWanted(db)).toBe(true);  // on by default
    setSetting(db, 'sunny_service', '0');
    expect(serviceWanted(db)).toBe(false);
  });

  it('starts or stops the native service to match', async () => {
    const db = await makeTestDb();
    setSetting(db, 'onboarded', '1');
    const n = fake();
    syncSunnyService(db, n);
    expect(n.startSunnyService).toHaveBeenCalledTimes(1);
    setSetting(db, 'sunny_service', '0');
    syncSunnyService(db, n);
    expect(n.stopSunnyService).toHaveBeenCalledTimes(1);
  });

  it('never throws if the native call fails', async () => {
    const db = await makeTestDb();
    setSetting(db, 'onboarded', '1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => syncSunnyService(db, { startSunnyService: () => { throw new Error('nope'); }, stopSunnyService: () => {} })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
