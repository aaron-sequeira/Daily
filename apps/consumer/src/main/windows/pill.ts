import { z } from 'zod';
import type { PillAction, PillNudge } from '../coach/types';

export interface PillWindowLike {
  send(channel: string, payload?: unknown): void;
  setIgnoreMouseEvents(ignore: boolean): void;
  showInactive(): void;
  setPosition(x: number, y: number): void;
  destroy(): void;
  isDestroyed(): boolean;
  onReady(cb: () => void): void;
  /** Fires once when the window is destroyed (by us, or after a failed load / renderer crash). */
  onClosed(cb: () => void): void;
}

export const pillMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hover'), hover: z.boolean() }).strict(),
  z.object({ type: z.literal('action'), id: z.number().int(), action: z.enum(['primary', 'secondary', 'dismiss', 'snooze', 'fewer', 'expired']) }).strict(),
  z.object({ type: z.literal('empty') }).strict()
]);
export type PillMessage = z.infer<typeof pillMessage>;

export function createPillManager(deps: {
  makeWindow(): PillWindowLike; placement(): { x: number; y: number }; onAction(id: number, action: PillAction): void;
  /** true when a window first shows, false when it is destroyed (index.ts holds Ctrl+Alt+D only while visible). */
  onVisible?(visible: boolean): void;
}) {
  let win: PillWindowLike | null = null;
  let ready = false;
  let visible = false;
  let queue: PillNudge[] = [];
  // The Island's resting pill (today's total and current app): while set, the window stays open between cards.
  let resting: IslandRest | null = null;
  const setVisible = (v: boolean): void => {
    if (visible === v) return;
    visible = v;
    deps.onVisible?.(v);
  };
  // Ids sent to the renderer ('pill:show') that haven't yet come back as a terminal
  // 'action' message. Guards against the race where the renderer's 'empty' (sent when
  // its own card list drains to zero) crosses in flight with a fresh 'pill:show' this
  // manager just sent — destroying the window then would drop that in-flight nudge.
  const outstanding = new Set<number>();

  const flush = (): void => {
    if (!win || !ready || !queue.length) return; // nothing to show: don't surface an empty window
    for (const n of queue) {
      win.send('pill:show', n);
      outstanding.add(n.id);
    }
    queue = [];
    win.showInactive();
    setVisible(true);
  };

  const close = (): void => {
    const w = win;
    win = null;
    ready = false;
    w?.destroy();
    setVisible(false);
  };

  /** Makes the window if there isn't a live one. Throws if it can't be created. */
  const ensureWindow = (): void => {
        if (!win || win.isDestroyed()) {
          // The old window is gone (crashed, or never existed): any ids it was
          // showing will never come back with a real action, so report them
          // expired instead of leaving them stuck in `outstanding` forever — that
          // would strand the replacement window, since 'empty' is ignored while
          // outstanding is non-empty.
          // Same for nudges still queued for a window whose page never loaded: they were
          // never seen, so report them expired rather than surfacing them late.
          const stale = [...outstanding, ...queue.map((q) => q.id)];
          outstanding.clear();
          queue = [];
          for (const id of stale) deps.onAction(id, 'expired');
          setVisible(false);
          ready = false;
          const w = deps.makeWindow();
          win = w;
          w.onClosed(() => { if (win === w) setVisible(false); });
          // Placed once, right when the window is created — not on every flush.
          const p = deps.placement();
          w.setPosition(p.x, p.y);
          w.setIgnoreMouseEvents(true);
          w.onReady(() => {
            ready = true;
            if (resting) { w.send('pill:rest', resting); w.showInactive(); }
            flush();
          });
        }
  };

  return {
    show(n: PillNudge): boolean {
      try {
        ensureWindow();
        queue.push(n);
        flush();
        return true;
      } catch (e) {
        console.error('[pill] window failed:', e);
        win = null;
        return false;
      }
    },
    /** The Island at rest: shown while non-null; null hides it (the window closes once no card is left). */
    setResting(r: IslandRest | null): void {
      resting = r;
      if (r) {
        try {
          const fresh = !win || win.isDestroyed();
          ensureWindow();
          if (!fresh && ready) win!.send('pill:rest', r);
        } catch (e) {
          console.error('[pill] window failed:', e);
          win = null;
        }
        return;
      }
      if (!win || win.isDestroyed()) return;
      win.send('pill:rest', null);
      if (!visible && outstanding.size === 0 && queue.length === 0) close();
    },
    dismissAll(): void {
      // Nudges still queued (window not ready yet) never reached the renderer, so report
      // them ourselves and drop them here. A bulk dismiss (Ctrl+Alt+D, "Delete my activity")
      // is not a per-nudge dismissal, so it must not feed the dismissal back-off: 'expired'.
      if (queue.length) {
        const dropped = queue;
        queue = [];
        for (const n of dropped) deps.onAction(n.id, 'expired');
      }
      if (win && !win.isDestroyed()) win.send('pill:dismissAll');
    },
    handle(msg: PillMessage): void {
      if (msg.type === 'hover') {
        win?.setIgnoreMouseEvents(!msg.hover);
      } else if (msg.type === 'action') {
        outstanding.delete(msg.id);
        deps.onAction(msg.id, msg.action);
      } else {
        if (outstanding.size > 0 || queue.length > 0) return; // stale 'empty': ignore
        if (resting) setVisible(false); // back to the resting pill: the window stays
        else close();
      }
    }
  };
}

export interface IslandRest { total: string; focus: string }
export const ISLAND_W = 640, ISLAND_H = 420, ISLAND_TOP = 8;
/** Top centre of a display's work area. */
export const islandPlacement = (wa: { x: number; y: number; width: number; height: number }): { x: number; y: number } =>
  ({ x: wa.x + Math.round((wa.width - ISLAND_W) / 2), y: wa.y + ISLAND_TOP });
