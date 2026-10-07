import { describe, expect, it } from 'vitest';
import { LOOK } from './look';
import { outlineVector, sunnySvg } from './svg';

describe('sunnySvg', () => {
  it('draws each mood in its own colours at the asked size', () => {
    const s = sunnySvg('glowing', 192);
    expect(s).toContain('width="192"');
    expect(s).toContain(LOOK.glowing.body);
    expect(s).toContain('#FFC861'); // sparkles
    expect(sunnySvg('sad', 192)).toContain('#7DB8EE'); // tear
    expect(sunnySvg('sad', 192)).not.toContain('#FFC861');
    expect(sunnySvg('unknown', 192)).not.toContain('NaN');
  });
});

describe('outlineVector', () => {
  it('is a white-stroked 24dp Android vector', () => {
    const v = outlineVector();
    expect(v.startsWith('<vector')).toBe(true);
    expect(v).toContain('android:viewportWidth="120"');
    expect(v).toContain('android:strokeColor="#FFFFFFFF"');
  });
});
