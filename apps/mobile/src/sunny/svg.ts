import { LOOK, raysPath, type SunnyFace } from './look';

const INK = '#3A2412';

/** A still frame of Sunny (no animation) for places outside the app: the notification's large icon. */
export function sunnySvg(face: SunnyFace, size: number): string {
  const L = LOOK[face];
  const parts = [
    `<circle cx="60" cy="60" r="52" fill="${L.body}" opacity="${L.glow[0]}"/>`,
    L.sparkle ? '<path d="M14 14 L16 20 L22 22 L16 24 L14 30 L12 24 L6 22 L12 20 Z M104 92 L105.5 96.5 L110 98 L105.5 99.5 L104 104 L102.5 99.5 L98 98 L102.5 96.5 Z" fill="#FFC861"/>' : '',
    L.rays ? `<path d="${raysPath(L.rays, L.rayLen)}" stroke="${L.edge}" stroke-width="5.5" stroke-linecap="round" fill="none"/>` : '',
    `<circle cx="60" cy="60" r="33" fill="${L.body}" stroke="${L.edge}" stroke-width="3"/>`,
    `<ellipse cx="40" cy="65" rx="6" ry="3.5" fill="#F2836B" opacity="${L.cheek}"/><ellipse cx="80" cy="65" rx="6" ry="3.5" fill="#F2836B" opacity="${L.cheek}"/>`,
    L.brows ? `<path d="${L.brows}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" fill="none"/>` : '',
    `<path d="${L.mouth}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="${L.mouthFill}"/>`,
    `<path d="${L.eyes}" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    L.tear ? '<path d="M44 61 Q41.4 66.5 44 68.5 Q46.6 66.5 44 61 Z" fill="#7DB8EE"/>' : '',
    L.cloud ? '<path d="M70 46 a9 9 0 0 1 4 -17 a12 12 0 0 1 22 1 a8.5 8.5 0 0 1 3 16 z" fill="#F3EEE8" stroke="#B9AFA4" stroke-width="2" stroke-linejoin="round"/>' : ''
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">${parts.join('')}</svg>`;
}

/** Status-bar icon: Android tints it one colour, so it is a white outline of Sunny (rays, face, smile). */
export function outlineVector(): string {
  const stroke = (d: string, w: number) =>
    `<path android:pathData="${d}" android:strokeColor="#FFFFFFFF" android:strokeWidth="${w}" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>`;
  const circle = 'M60,27 a33,33 0 1,0 0.01,0 z';
  return [
    '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="120" android:viewportHeight="120">',
    stroke(raysPath(12, 12), 7),
    stroke(circle, 7),
    stroke('M47 52 L47 56 M73 52 L73 56', 7),
    stroke('M47 67 Q60 78 73 67', 6),
    '</vector>'
  ].join('\n');
}
