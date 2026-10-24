import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ps1 = readFileSync(join(__dirname, '../../../resources/ocr-helper.ps1'), 'utf8');

describe('ocr-helper.ps1', () => {
  it('skips a hung (not responding) window before PrintWindow, as a normal no-capture result', () => {
    expect(ps1).toContain('public static extern bool IsHungAppWindow(IntPtr h);');
    const fn = ps1.slice(ps1.indexOf('function Capture-Foreground'));
    const hung = fn.indexOf('IsHungAppWindow($h)'), print = fn.indexOf('::PrintWindow(');
    expect(hung).toBeGreaterThan(-1);
    expect(hung).toBeLessThan(print);
    expect(fn.slice(hung, hung + 80)).toContain('return $null');
  });
  it('answers SHOT and CAPTURE+SHOT with a JPEG of at most 960 px at quality 70, after the window-changed guard', () => {
    expect(ps1).toContain("'SHOT'");
    expect(ps1).toContain("'CAPTURE+SHOT'");
    expect(ps1).toContain('$SHOT_MAX = 960');
    expect(ps1).toContain('[long]70');
    const fn = ps1.slice(ps1.indexOf('function Capture-Foreground'));
    expect(fn.indexOf("error = 'window_changed'")).toBeLessThan(fn.indexOf('Jpeg-Base64'));
  });
  it('keeps running without an OCR language, so screenshots still work', () => {
    expect(ps1).toContain('Emit @{ ready = $true; ocr = $false }');
    expect(ps1).not.toMatch(/no_ocr_language'\s*\};\s*exit 2/);
  });
});
