import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Daylens became Daily. Internal identifiers keep the old name on purpose (see the rebrand plan): renaming them
// would only churn code and break existing users' data, installs and model downloads.
const INTERNAL = /DaylensSettings|DaylensApi|window\.daylens|daylens: DaylensApi|daylens\.sqlite|DAYLENS_MODEL_DIR|DaylensFg|ai\.worksight\.daylens|daylens-laya-onnx|daylens_keep|exposeInMainWorld\('daylens'|old Daylens|\$APPDATA\\Daylens/g;
// Comments are not user-facing.
const WHOLE_LINE_COMMENT = /^\s*(\/\/|\/\*|\*|;)/;
const stripComments = (line: string) => line.replace(/\/\*.*?\*\//g, '').replace(/\s\/\/ .*$/, '');
// migrate.ts is about the old name by definition.
const SKIP = /migrate\.ts$/;

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx|css|html)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('brand', () => {
  it('no user-facing "Daylens" is left', () => {
    const root = join(__dirname, '..');
    const hits: string[] = [];
    for (const f of [...files(join(root, 'src')), join(root, 'resources', 'installer.nsh')]) {
      if (SKIP.test(f)) continue;
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (WHOLE_LINE_COMMENT.test(line)) return;
        if (/daylens/i.test(stripComments(line).replace(INTERNAL, ''))) hits.push(`${relative(root, f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
