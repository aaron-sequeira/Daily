import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOODS } from '../sunny/mood';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('Island Swift', () => {
  it('app and widget compile the same SunnyShared.swift (else ActivityKit silently shows nothing)', () => {
    expect(read('../../targets/island/SunnyShared.swift')).toBe(read('../../modules/daily-native/ios/SunnyShared.swift'));
  });
  it('every mood the state can pick has an image', () => {
    for (const m of MOODS) expect(existsSync(new URL(`../../targets/island/images/sunny-${m}.png`, import.meta.url))).toBe(true);
  });
  it('ContentState has every IslandState key', () => {
    const swift = read('../../modules/daily-native/ios/SunnyShared.swift');
    for (const k of ['phase', 'mood', 'title', 'line', 'compact', 'timerStartMs', 'timerEndMs', 'color', 'icon', 'reminderId', 'canBreak'])
      expect(swift).toMatch(new RegExp(`var ${k}:`));
  });
});
