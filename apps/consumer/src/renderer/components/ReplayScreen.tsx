import { useEffect, useState } from 'react';
import { localDate } from '@worksight/core/date';
import type { DaylensSettings } from '../../main/settings';
import type { ReplayShot, ReplayView } from '../../main/ipc';
import { api } from '../lib/api';
import { formatClock, formatHm } from '../lib/format';
import { addDays } from '../lib/insights';
import { reportDateLabel } from '../lib/report';
import { dayWindow, hourTicks, ribbon, shotsFor, spread } from '../lib/replay';

export function ReplayScreen({ settings, onChange, onOpenSettings }: {
  settings: DaylensSettings; onChange: (s: DaylensSettings) => void; onOpenSettings: () => void;
}) {
  const today = localDate(Date.now());
  const [date, setDate] = useState(today);
  const [view, setView] = useState<ReplayView | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [big, setBig] = useState<ReplayShot | null>(null);

  useEffect(() => {
    let alive = true;
    const load = (): void => { api.replay.day(date).then((v) => { if (alive) setView(v); }).catch((e) => console.error('[renderer] replay failed:', e)); };
    load();
    const off = api.onUpdate(load);
    const t = date === today ? setInterval(load, 60_000) : null; // today keeps growing
    return () => { alive = false; off(); if (t) clearInterval(t); };
  }, [date, today, settings.screenshots]);

  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setBig(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [big]);

  const answer = async (on: boolean): Promise<void> => {
    try { onChange(await api.settings.set({ screenshots: on, screenshotsAsked: true })); } catch (e) { console.error(e); }
  };

  if (!view) return <><main className="report replay" /><aside className="panel" /></>;
  const chapters = view.chapters;
  const win = dayWindow(chapters);
  const cur = chapters.find((c) => c.id === pick) ?? chapters[chapters.length - 1] ?? null;
  const curN = cur ? chapters.indexOf(cur) + 1 : 0;
  const total = chapters.reduce((a, c) => a + c.ms, 0) / 1000;
  const seenShots = cur ? shotsFor(cur, view.shots) : [];
  const days = settings.rawTextRetentionDays;

  return (
    <>
      <main className="report replay">
        <div className="rhead">
          <button className="arrow" aria-label="Previous day" onClick={() => { setDate(addDays(date, -1)); setPick(null); }}>‹</button>
          <button className="arrow" aria-label="Next day" disabled={date >= today} onClick={() => { setDate(addDays(date, 1)); setPick(null); }}>›</button>
          <span className="rp-eyebrow">Replay · {reportDateLabel(date, today)}</span>
        </div>
        {!cur || !win ? (
          <h1 className="rp-title">Nothing recorded on this day.</h1>
        ) : (
          <>
            <h1 className="rp-title">{chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}, <b>{formatHm(total)}</b> on screen</h1>
            <div className="rp-ribbon" role="group" aria-label="Chapters of the day">
              {ribbon(chapters, win[0], win[1]).map((r, i) => (
                <button key={r.id} className={`rp-ch${r.id === cur.id ? ' on' : ''}`} aria-pressed={r.id === cur.id}
                  aria-label={`Chapter ${i + 1}: ${chapters[i].title}`} title={chapters[i].title}
                  style={{ left: `${r.leftPct}%`, width: `${r.widthPct}%`, background: `var(--cat-${r.category}, var(--stone))` }}
                  onClick={() => setPick(r.id)}>{r.widthPct >= 6 ? r.label : ''}</button>
              ))}
            </div>
            <div className="rp-ticks" aria-hidden="true">
              {hourTicks(win[0], win[1]).map((t) => <span key={t.label} style={{ left: `${t.pct}%` }}>{t.label}</span>)}
            </div>
            <section className="rp-card" key={cur.id}>
              <p className="rp-meta"><i style={{ background: `var(--cat-${cur.category}, var(--stone))` }} />Chapter {curN} · {formatClock(cur.start)} – {formatClock(cur.end)}</p>
              <h2>{cur.title}</h2>
              <ul className="rp-apps">
                {cur.apps.slice(0, 5).map((a) => <li key={a.app}><span>{a.app}</span><b>{a.minutes < 1 ? '<1m' : formatHm(a.minutes * 60)}</b></li>)}
              </ul>
              <h3>What you saw</h3>
              {seenShots.length > 0 && (
                <div className="rp-shots">
                  {spread(seenShots, 12).map((s) => (
                    <button key={s.at} className="rp-shot" aria-label={`Screenshot at ${formatClock(s.at)}${s.title ? `: ${s.title}` : ''}`} onClick={() => setBig(s)}>
                      <img src={s.url} alt="" loading="lazy" />
                      <span>{formatClock(s.at)}{s.title ? ` · ${s.title}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
              {cur.seen.length > 0 ? (
                <ul className="rp-seen">{cur.seen.map((t) => <li key={t}>{t}</li>)}</ul>
              ) : seenShots.length === 0 && <p className="rp-none">No window titles were kept for this chapter.</p>}
            </section>
          </>
        )}
      </main>
      <aside className="panel rp-side">
        {cur && (
          <div className="rp-stats">
            <div><small>Time</small><b>{formatHm(cur.ms / 1000)}</b></div>
            <div><small>Apps</small><b>{cur.apps.length}</b></div>
            <div><small>Switches</small><b>{cur.switches}</b></div>
            <div><small>Pictures</small><b>{seenShots.length}</b></div>
          </div>
        )}
        {!view.screenshots && (!view.asked ? (
          <div className="rp-ask">
            <h3>See what you saw</h3>
            <p>Daily can keep small screenshots of the window you're using, only on this PC, for {days === 1 ? '1 day' : `${days} days`}.</p>
            <div className="rp-ask-btns">
              <button className="btn" onClick={() => { void answer(true); }}>Turn on</button>
              <button className="btn s" onClick={() => { void answer(false); }}>Not now</button>
            </div>
          </div>
        ) : (
          <button className="ob-link rp-quiet" onClick={onOpenSettings}>Screenshots are off. Change this in Settings</button>
        ))}
      </aside>
      {big && (
        <div className="rp-lightbox" role="dialog" aria-modal="true" aria-label="Screenshot" onClick={() => setBig(null)}>
          <img src={big.url} alt={big.title ?? `Screenshot at ${formatClock(big.at)}`} />
          <p>{formatClock(big.at)} · {big.app}{big.title ? ` · ${big.title}` : ''}</p>
          <button className="btn s" autoFocus onClick={() => setBig(null)}>Close</button>
        </div>
      )}
    </>
  );
}
