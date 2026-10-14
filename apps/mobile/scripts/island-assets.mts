// Renders Sunny's faces for the Island widget (targets/island/images). Run: npx tsx scripts/island-assets.mts
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { sunnySvg } from '../src/sunny/svg.ts';

const FACES = ['happy', 'glowing', 'alright'] as const; // the moods src/island/state.ts can pick

for (const face of FACES) {
  const out = fileURLToPath(new URL(`../targets/island/images/sunny-${face}.png`, import.meta.url));
  await sharp(Buffer.from(sunnySvg(face, 180))).png().toFile(out); // 60 pt at 3x
  console.log(out);
}
