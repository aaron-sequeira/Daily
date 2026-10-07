import { describe, expect, it } from 'vitest';
import { reportHtml } from './pdf';

describe('reportHtml', () => {
  it('escapes everything it prints (Review Focus 5)', () => {
    const html = reportHtml({
      dateLabel: 'Tue 6 Oct', headline: '<script>alert("x")</script> & co', story: "It's <b>bold</b>",
      highlights: [{ label: 'Most opened', value: 'Tom & Jerry <3 · 4×' }],
      plan: [{ text: 'Leave "Reels" after 20 minutes', done: true }]
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co');
    expect(html).toContain('Tom &amp; Jerry &lt;3 · 4×');
    expect(html).toContain('It&#39;s');
    expect(html).toContain('Your day, written');
  });

  it('leaves out the story when there is none', () => {
    const html = reportHtml({ dateLabel: 'Tue 6 Oct', headline: 'Calm', story: null, highlights: [], plan: [] });
    expect(html).toContain('>Your day<');
    expect(html).not.toContain('<p>');
  });
});
