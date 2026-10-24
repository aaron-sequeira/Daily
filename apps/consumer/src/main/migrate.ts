import * as nodeFs from 'node:fs';
import { join } from 'node:path';

type Fs = Pick<typeof nodeFs, 'existsSync' | 'renameSync' | 'cpSync' | 'rmSync'>;

/** Daylens became Daily, and Electron's userData follows the app name: bring an existing user's data
 * (%APPDATA%\Daylens) over before anything opens it, so history, reports, models and settings stay. A Daily folder
 * without a database is only what Electron creates on startup, so it gives way. If the folder can't be moved (a file
 * held open), it is copied and the original kept. */
export function migrateUserData(appData: string, fs: Fs = nodeFs): 'moved' | 'copied' | 'none' {
  const from = join(appData, 'Daylens');
  const to = join(appData, 'Daily');
  if (!fs.existsSync(join(from, 'daylens.sqlite')) || fs.existsSync(join(to, 'daylens.sqlite'))) return 'none';
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  try {
    fs.renameSync(from, to);
    return 'moved';
  } catch {
    fs.cpSync(from, to, { recursive: true });
    return 'copied';
  }
}
