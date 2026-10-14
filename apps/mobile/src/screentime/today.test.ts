import { describe, expect, it } from 'vitest';
import type { TodayView } from '../today/build';
import { withPhoneTime } from './today';

const view = { phoneMin: 0, goalMin: 240, leftMin: 240, mood: 'glowing', empty: true } as TodayView;

describe('withPhoneTime', () => {
  it('sets phone time, minutes left and Sunny’s mood from the milestone', () => {
    expect(withPhoneTime(view, 216)).toMatchObject({ phoneMin: 216, leftMin: 24, mood: 'alright', empty: false });
  });
  it('is empty before the first milestone', () => {
    expect(withPhoneTime(view, 0)).toMatchObject({ phoneMin: 0, leftMin: 240, mood: 'glowing', empty: true });
  });
});
