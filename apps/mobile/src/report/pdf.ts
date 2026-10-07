export type ReportDoc = { dateLabel: string; headline: string; story: string | null; highlights: { label: string; value: string }[]; plan: { text: string; done: boolean }[] };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The report as a printable page (spec §10.3: expo-print → share sheet). Every value is escaped: app names come from other apps. */
export function reportHtml(d: ReportDoc): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,Roboto,'Helvetica Neue',sans-serif;color:#171717;background:#FBF8F4;margin:40px}
.brand{font-size:13px;font-weight:600;color:#77716C}
.card{background:#D8D2FC;border-radius:20px;padding:22px;margin:16px 0}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(0,0,0,.6)}
h1{font-size:24px;font-weight:500;line-height:1.25;margin:8px 0 0}
p{font-size:14px;line-height:1.5;margin:12px 0 0}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px}
td{padding:10px 14px;border-top:1px solid #F0E9E3;font-size:13px}
td.v{text-align:right;font-weight:600}
h2{font-size:14px;color:#77716C;font-weight:500;margin:20px 0 6px}
li{font-size:14px;margin:6px 0}
</style></head><body>
<div class="brand">Daily · ${esc(d.dateLabel)}</div>
<div class="card"><div class="eyebrow">${d.story ? 'Your day, written' : 'Your day'}</div><h1>${esc(d.headline)}</h1>${d.story ? `<p>${esc(d.story)}</p>` : ''}</div>
<table>${d.highlights.map((h) => `<tr><td>${esc(h.label)}</td><td class="v">${esc(h.value)}</td></tr>`).join('')}</table>
<h2>Tomorrow, try</h2><ul>${d.plan.map((p) => `<li>${p.done ? '✓ ' : ''}${esc(p.text)}</li>`).join('')}</ul>
</body></html>`;
}
