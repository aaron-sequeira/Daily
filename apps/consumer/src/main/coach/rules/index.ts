import type { Rule } from '../snapshot';
import { focusStart } from './focus';
import { eyeBreak, goal, stretch, windDown } from './health';
import { appCap, doomscroll, scattered, stuckEscape } from './behaviour';
import { repeatSearch, stuckTip } from './tips';
import { belowAvg, deepWork } from './wins';
import { reminderRule } from './reminders';
import { dayReady, frequentReturns, personalBest } from './moments';

/** Priority order: health first, wins last. */
export const RULES: Rule[] = [focusStart, reminderRule, eyeBreak, stretch, windDown, goal, doomscroll, scattered, stuckEscape, appCap, stuckTip, repeatSearch, frequentReturns, deepWork, personalBest, belowAvg, dayReady];
