// Renders Sunny for Android: mood PNGs (notification large icon) and the status-bar outline vector.
// Run with `pnpm --filter @worksight/mobile assets:sunny` after changing src/sunny/look.ts or svg.ts.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outlineVector, sunnySvg } from '../src/sunny/svg';
import type { SunnyFace } from '../src/sunny/look';

const here = dirname(fileURLToPath(import.meta.url));
const res = join(here, '..', 'modules', 'daily-native', 'android', 'src', 'main', 'res');
const faces: SunnyFace[] = ['glowing', 'happy', 'alright', 'fading', 'sad', 'unknown'];

mkdirSync(join(res, 'drawable-nodpi'), { recursive: true });
for (const f of faces) {
  const png = new Resvg(sunnySvg(f, 192), { fitTo: { mode: 'width', value: 192 } }).render().asPng();
  writeFileSync(join(res, 'drawable-nodpi', `sunny_${f}.png`), png);
}
mkdirSync(join(res, 'drawable'), { recursive: true });
writeFileSync(join(res, 'drawable', 'ic_sunny_outline.xml'), outlineVector() + '\n');
console.log(`wrote ${faces.length} PNGs and ic_sunny_outline.xml to ${res}`);
