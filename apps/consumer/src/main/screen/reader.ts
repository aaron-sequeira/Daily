import { createHash } from 'node:crypto';
import type { ForegroundSource } from '@worksight/core';
import { localDate } from '@worksight/core/date';
import type { DaylensSettings } from '../settings';
import type { OcrClient } from '../ocr/client';
import type { ScreenStore } from './store';
import type { ShotStore } from './shots';
import { redact } from './redact';
import { isExcluded, parseExclusions } from './exclusions';

export type ReadOutcome = 'skipped-off' | 'skipped-idle' | 'skipped-backlog' | 'skipped-self' | 'skipped-excluded' | 'skipped-same' | 'no-capture' | 'discarded' | 'stored' | 'stored-dup';
export const SAME_WINDOW_MS = 120_000;
export interface ScreenReader { tick(): Promise<ReadOutcome>; }

export function createScreenReader(deps: {
  ocr: Pick<OcrClient, 'capture'>; foreground: ForegroundSource; settings: () => DaylensSettings;
  idleSec: () => number; store: ScreenStore; now: () => number; selfPid: number;
  backlogBlocked?: () => boolean;
  shots?: Pick<ShotStore, 'save'>;
}): ScreenReader {
  // With screenshots only, nothing lands in screen_reads, so "same window" is remembered here.
  let lastShot: { app: string; title: string | null; at: number } | null = null;
  const sameWindow = (prev: { at: number } | null, now: number): boolean => !!prev && now >= prev.at && now - prev.at < SAME_WINDOW_MS;
  return {
    async tick() {
      const s = deps.settings();
      if (!(s.screenReading || s.screenshots) || !s.consentGranted || s.trackingPaused) return 'skipped-off';
      if (deps.idleSec() >= s.idleThresholdSec) return 'skipped-idle';
      // Labelling can't keep up (model not ready or paused): stop growing the queue until it drains. Screenshots
      // aren't labelled, so they carry on.
      const wantText = s.screenReading && !deps.backlogBlocked?.();
      const wantShot = s.screenshots && !!deps.shots;
      if (!wantText && !wantShot) return s.screenReading ? 'skipped-backlog' : 'skipped-off';
      const fg = await deps.foreground.get();
      if (!fg) return 'no-capture';
      // Never read our own window: opening Settings -> Privacy would otherwise re-store Daily's own UI
      // text on the next tick, restarting its retention clock, and the peek would show Daily itself.
      if (fg.pid === deps.selfPid) return 'skipped-self';
      const patterns = parseExclusions(s.exclusions);
      if (isExcluded(patterns, fg.appName, fg.title)) return 'skipped-excluded';
      const now = deps.now();
      const title = s.captureWindowTitles ? fg.title : null;
      const last = wantText ? deps.store.last() : null;
      if (wantText ? last && last.appName === fg.appName && last.windowTitle === title && sameWindow(last, now)
        : lastShot && lastShot.app === fg.appName && lastShot.title === title && sameWindow(lastShot, now)) return 'skipped-same';
      const cap = await deps.ocr.capture({ text: wantText, shot: wantShot });
      if (!cap) return 'no-capture';
      // Settings may have changed during capture (up to 8 s): re-check before storing.
      const s2 = deps.settings();
      const keepText = wantText && s2.screenReading;
      const keepShot = wantShot && s2.screenshots && typeof cap.jpg === 'string';
      if (!(keepText || keepShot) || !s2.consentGranted || s2.trackingPaused) return 'skipped-off';
      const patterns2 = parseExclusions(s2.exclusions);
      // The window may have changed between the check above and the capture: never keep text or pixels from
      // another process or from an excluded window (check both pre-capture and captured titles).
      if (cap.pid !== fg.pid || isExcluded(patterns2, fg.appName, fg.title) || isExcluded(patterns2, fg.appName, cap.title)) return 'discarded';
      const storedTitle = s2.captureWindowTitles ? cap.title : null;
      if (keepShot) {
        deps.shots!.save({ at: now, date: localDate(now), app: fg.appName, title: storedTitle, jpg: cap.jpg! });
        lastShot = { app: fg.appName, title, at: now };
      }
      if (!keepText) return 'stored';
      const text = redact(cap.text);
      const textHash = createHash('sha1').update(text).digest('hex');
      const dup = last?.textHash === textHash;
      deps.store.insert({ at: now, date: localDate(now), appName: fg.appName, windowTitle: storedTitle, text: dup ? null : text, textHash });
      return dup ? 'stored-dup' : 'stored';
    }
  };
}

/** Erase stored text older than `days` (rows are kept for time accounting), and screenshots with it. Returns
 * text rows purged. */
export function runRetention(store: ScreenStore, days: number, now: number, shots?: Pick<ShotStore, 'purgeBefore'>): number {
  if (days <= 0) return 0;
  const n = store.purgeTextBefore(now - days * 86_400_000); // text first: a stuck screenshot file must not block it
  try { shots?.purgeBefore(now - days * 86_400_000); } catch (e) { console.error('[shots] retention failed:', e); }
  return n;
}
