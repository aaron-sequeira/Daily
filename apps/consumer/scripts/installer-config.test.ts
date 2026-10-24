import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = join(__dirname, '..');
const yml = readFileSync(join(app, 'electron-builder.yml'), 'utf8');
const nsh = readFileSync(join(app, 'resources', 'installer.nsh'), 'utf8');

describe('electron-builder.yml', () => {
  it('identity and one-click per-user install', () => {
    // The appId stays from Daylens on purpose: the Daily installer upgrades the old install in place.
    expect(yml).toMatch(/^appId: ai\.worksight\.daylens$/m);
    expect(yml).toMatch(/^productName: Daily$/m);
    expect(yml).toMatch(/^artifactName: Daily-Setup-\$\{version\}\.\$\{ext\}$/m);
    expect(yml).toMatch(/shortcutName: Daily$/m);
    expect(yml).toMatch(/oneClick: true/);
    expect(yml).toMatch(/perMachine: false/);
    expect(yml).toMatch(/include: resources\/installer\.nsh/);
    expect(yml).toMatch(/icon: resources\/icon\.ico/);
  });
  it('overrides the sanitized package name so the install folder is "daily", not "@worksightconsumer"', () => {
    expect(yml).toMatch(/extraMetadata:/);
    expect(yml).toMatch(/^\s*name: daily$/m);
  });
  it('excludes CUDA, ARM, Mac and Linux binaries', () => {
    for (const p of ['@node-llama-cpp/win-x64-cuda', '@node-llama-cpp/win-x64-cuda-ext', '@node-llama-cpp/win-arm64',
      '@node-llama-cpp/{linux,mac}-*', 'onnxruntime-node/bin/napi-v3/{darwin,linux}', 'onnxruntime-node/bin/napi-v3/win32/arm64',
      'active-win/lib/binding/*darwin*']) expect(yml).toContain(`!**/node_modules/${p}`);
  });
  it('ships the OCR helper and both tray icons as extra resources', () => {
    for (const f of ['ocr-helper.ps1', 'tray.png', 'tray@2x.png', 'icon.ico']) expect(yml).toContain(`from: resources/${f}`);
  });
});

describe('installer.nsh', () => {
  it('asks before deleting data, default No, never during an update, with the path quoted', () => {
    expect(nsh).toContain('!macro customUnInstall');
    expect(nsh).toContain('${ifNot} ${isUpdated}');
    expect(nsh).toContain('MB_DEFBUTTON2');
    expect(nsh).toContain('Also delete your Daily history');
    expect(nsh).toContain('RMDir /r "$APPDATA\\Daily"');
    expect(nsh).toContain('RMDir /r "$APPDATA\\Daylens"'); // a copy left behind when the folder could not be moved
  });
  it('silences the prompt under a silent uninstall (/S) by defaulting to No', () => {
    expect(nsh).toMatch(/" \/SD IDNO IDNO daylens_keep/); // NSIS: MessageBox flags text [/SD IDx] [IDx label]
  });
});
