// Renders Daily's launcher icons from the same artwork as src/ui/Logo.tsx.
// Run from apps/mobile: node scripts/make-icons.mjs   (needs `sharp`, hoisted in the repo root node_modules)
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const INK = '#171717', SUN = '#F6B35E', FACE = '#3A2412', SAND = '#FBF8F4';

// The artwork in Logo.tsx's 100x100 box, without the rounded square behind it.
const art = (sun = SUN, face = FACE, horizon = SAND) => `
  <defs><clipPath id="sky"><rect width="100" height="64"/></clipPath></defs>
  <circle cx="50" cy="64" r="21" fill="${sun}" clip-path="url(#sky)"/>
  <path d="M43.5 52 L43.5 54 M56.5 52 L56.5 54" stroke="${face}" stroke-width="3.8" stroke-linecap="round"/>
  <path d="M44.8 57.6 Q50 61.4 55.2 57.6" stroke="${face}" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  <path d="M19.01,48.92 Q13.78,46.51 8.74,44.59 M31.48,34.27 Q28.33,30.03 25.87,25.86 M50.03,29.24 Q49.51,23.88 50.04,18.51 M67.62,34.54 Q71.02,29.32 74.51,23.81 M79.18,48.33 Q85.67,44.75 92.19,42.23" stroke="${sun}" stroke-width="7" stroke-linecap="round" fill="none"/>
  <path d="M14,67 C17,66.58 26,64.5 32,64.5 C38,64.5 44,67 50,67 C56,67 62,64.58 68,64.5 C74,64.42 83,66.17 86,66.5" stroke="${horizon}" stroke-width="6" stroke-linecap="round" fill="none"/>`;

// `scale` shrinks the artwork around the centre (adaptive icons keep the middle ~66% safe).
const svg = (size, { bg = null, scale = 1, content = art() } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  ${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${content}</g></svg>`;

const out = (file, markup, size) => sharp(Buffer.from(markup)).resize(size, size).png().toFile(file);

await out('assets/icon.png', svg(1024, { bg: INK, scale: 0.86 }), 1024); // iOS/Expo: full-bleed, the OS rounds it
await out('assets/android-icon-background.png', svg(512, { bg: INK, content: '' }), 512);
await out('assets/android-icon-foreground.png', svg(512, { scale: 0.72 }), 512);
await out('assets/android-icon-monochrome.png', svg(432, { scale: 0.72, content: art('#000', '#000', '#000') }), 432);
// Splash = the intro's first frame (src/ui/Intro.tsx): the icon square with only the horizon; Sunny then rises in the app.
await out('assets/splash-icon.png', `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="${INK}"/><path d="M14,67 C17,66.58 26,64.5 32,64.5 C38,64.5 44,67 50,67 C56,67 62,64.58 68,64.5 C74,64.42 83,66.17 86,66.5" stroke="${SAND}" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`, 1024);
// Status-bar notification icon: Android shows only its alpha, so a white silhouette on transparent.
await out('assets/notification-icon.png', svg(96, { scale: 0.9, content: art('#fff', 'rgba(0,0,0,0)', '#fff') }), 96);
await out('assets/favicon.png', svg(48, { bg: INK, scale: 0.86 }), 48);
// Android 12+ splash icon: 240 dp canvas (960 px at xxxhdpi) with the 112 dp icon square (448 px) centred; see plugins/withSplashSquare.js.
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="960" viewBox="0 0 960 960"><g transform="translate(256 256) scale(4.48)"><rect width="100" height="100" rx="24" fill="${INK}"/><path d="M14,67 C17,66.58 26,64.5 32,64.5 C38,64.5 44,67 50,67 C56,67 62,64.58 68,64.5 C74,64.42 83,66.17 86,66.5" stroke="${SAND}" stroke-width="6" stroke-linecap="round" fill="none"/></g></svg>`)).png().toFile('assets/splash-square.png');
writeFileSync('assets/.icons-generated', 'by scripts/make-icons.mjs\n');
console.log('icons written');
