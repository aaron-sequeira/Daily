import { join, relative, isAbsolute } from 'node:path';

/** `daily-shot://<YYYY-MM-DD>/<at>.jpg` → the file under the shots folder, or null for anything else. The URL is
 * matched whole (after decoding) against a strict pattern, so `..`, encoded separators, drive letters and other
 * file types never reach the file system; the relative-path check is a second guard. */
export function shotPath(dir: string, url: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(url); } catch { return null; }
  const m = /^daily-shot:\/\/(\d{4}-\d{2}-\d{2})\/(\d{1,16})\.jpg$/.exec(decoded);
  if (!m) return null;
  const p = join(dir, m[1], `${m[2]}.jpg`);
  const rel = relative(dir, p);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? p : null;
}
