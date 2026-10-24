import * as nodeFs from 'node:fs';
import { join } from 'node:path';

type Fs = Pick<typeof nodeFs, 'existsSync' | 'renameSync' | 'cpSync' | 'rmSync' | 'openSync' | 'closeSync' | 'statSync' | 'unlinkSync'>;

/** A lock older than this was left by a crash. */
const STALE_LOCK_MS = 10 * 60_000;

/** Daylens became Daily, and Electron's userData follows the app name: bring an existing user's data
 * (%APPDATA%\Daylens) over before anything opens it, so history, reports, models and settings stay.
 *
 * - `moved`/`copied`: done. `none`: nothing to do (fresh install, or already done).
 * - `busy`: another launch is migrating right now; this one should quit.
 * - `failed`: nothing was changed (no half-made Daily); the caller must not start, so the next launch retries.
 *
 * A %APPDATA%\Daily without our database may belong to another app called Daily: it is set aside, never deleted.
 * A copy (when the folder can't be moved) goes through a temporary folder, so Daily only appears when complete. */
export function migrateUserData(appData: string, fs: Fs = nodeFs): 'moved' | 'copied' | 'none' | 'busy' | 'failed' {
  const from = join(appData, 'Daylens');
  const to = join(appData, 'Daily');
  if (!fs.existsSync(join(from, 'daylens.sqlite')) || fs.existsSync(join(to, 'daylens.sqlite'))) return 'none';

  const lock = join(appData, 'Daily.migrating.lock');
  try {
    const fd = fs.openSync(lock, 'wx');
    fs.closeSync(fd);
  } catch {
    let stale = false;
    try { stale = Date.now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS; } catch { /* vanished: treat as busy */ }
    if (!stale) return 'busy';
    try { fs.unlinkSync(lock); return migrateUserData(appData, fs); } catch { return 'busy'; }
  }

  const temp = join(appData, 'Daily.migrating');
  try {
    if (fs.existsSync(to)) fs.renameSync(to, join(appData, `Daily.before-daylens-${Date.now()}`));
    try {
      fs.renameSync(from, to);
      return 'moved';
    } catch {
      fs.rmSync(temp, { recursive: true, force: true });
      fs.cpSync(from, temp, { recursive: true });
      fs.renameSync(temp, to);
      return 'copied';
    }
  } catch {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch { /* best effort */ }
    return 'failed';
  } finally {
    try { fs.unlinkSync(lock); } catch { /* best effort */ }
  }
}
