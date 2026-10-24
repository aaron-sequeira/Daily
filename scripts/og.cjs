// Renders website/assets/og.png (the 1200x630 link-preview image): the top of the website as a visitor sees it.
// Run with Electron, not Node: `pnpm exec electron scripts/og.cjs` (from the repo root). A hidden window only.
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  // Shown but placed off-screen: a hidden window never advances the hero's draw-in animation, so it would be
  // captured half-drawn.
  const win = new BrowserWindow({ x: -4000, y: -4000, width: 1200, height: 630, show: true, frame: false, skipTaskbar: true, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(join(__dirname, '..', 'website', 'index.html'));
  await new Promise((r) => setTimeout(r, 3000)); // let the hero's entrance animation finish
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1200, height: 630 });
  writeFileSync(join(__dirname, '..', 'website', 'assets', 'og.png'), img.resize({ width: 1200, height: 630 }).toPNG());
  console.log('[og] wrote website/assets/og.png');
  app.quit();
});
