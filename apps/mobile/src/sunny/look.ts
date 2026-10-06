import type { Mood } from './mood';

export type SunnyFace = Mood | 'unknown';

export type MoodLook = {
  body: string; edge: string;
  glow: [number, number];        // glow opacity pulse from → to
  sparkle: boolean;
  rays: number; rayLen: number;
  spinSec: number;               // 0 = still
  bob: number; bobSec: number;   // viewBox units; negative = up
  cheek: number;
  eyes: string; brows: string; mouth: string; mouthFill: string;
  tear: boolean; cloud: boolean; question: boolean;
};

export const LOOK: Record<SunnyFace, MoodLook> = {
  glowing: { body: '#FFB547', edge: '#EE8A1C', glow: [0.38, 0.16], sparkle: true, rays: 12, rayLen: 15, spinSec: 22, bob: -4, bobSec: 2.2, cheek: 0.6,
    eyes: 'M41 56 Q46.5 49 52 56 M68 56 Q73.5 49 79 56', brows: '', mouth: 'M45 65 Q60 84 75 65 Z', mouthFill: '#8A3214', tear: false, cloud: false, question: false },
  happy: { body: '#F6B35E', edge: '#E3973A', glow: [0.22, 0.1], sparkle: false, rays: 12, rayLen: 12, spinSec: 40, bob: -3, bobSec: 2.8, cheek: 0.42,
    eyes: 'M47 51.5 L47 56 M73 51.5 L73 56', brows: '', mouth: 'M47 66 Q60 78 73 66', mouthFill: 'none', tear: false, cloud: false, question: false },
  alright: { body: '#F3C47F', edge: '#D9A55C', glow: [0.08, 0.04], sparkle: false, rays: 10, rayLen: 9, spinSec: 0, bob: -2, bobSec: 3.4, cheek: 0.18,
    eyes: 'M48 52.5 L48 56 M74 52.5 L74 56', brows: 'M42 46 L52 45.5 M68 45.5 L78 46', mouth: 'M50 69.5 Q60 71.5 70 68', mouthFill: 'none', tear: false, cloud: false, question: false },
  fading: { body: '#E4C796', edge: '#C4A577', glow: [0, 0], sparkle: false, rays: 9, rayLen: 6, spinSec: 0, bob: 1.5, bobSec: 4, cheek: 0,
    eyes: 'M41 55 L53 55 M67 55 L79 55 M47 58 L47 58.6 M73 58 L73 58.6', brows: '', mouth: 'M50 72 Q55 69 60 72 Q65 75 70 72', mouthFill: 'none', tear: false, cloud: false, question: false },
  sad: { body: '#D2C3AD', edge: '#A99A85', glow: [0, 0], sparkle: false, rays: 8, rayLen: 3, spinSec: 0, bob: 3, bobSec: 4.6, cheek: 0,
    eyes: 'M47 54.5 L47 57.5 M73 54.5 L73 57.5', brows: 'M41 49 L51 45.5 M79 49 L69 45.5', mouth: 'M48 75 Q60 64 72 75', mouthFill: 'none', tear: true, cloud: true, question: false },
  unknown: { body: '#E9E3DD', edge: '#C9C0B6', glow: [0, 0], sparkle: false, rays: 0, rayLen: 0, spinSec: 0, bob: -1.5, bobSec: 3.4, cheek: 0,
    eyes: 'M48 53 L48 56 M72 53 L72 56', brows: '', mouth: 'M51 70 L69 70', mouthFill: 'none', tear: false, cloud: false, question: true }
};

/** SVG path for `n` rays of length `len`, starting at radius 42 around (60,60), first ray pointing up. */
export function raysPath(n: number, len: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n - Math.PI / 2;
    const p = (r: number) => `${(60 + r * Math.cos(a)).toFixed(1)} ${(60 + r * Math.sin(a)).toFixed(1)}`;
    d += `M${p(42)} L${p(42 + len)} `;
  }
  return d.trim();
}
