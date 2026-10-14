import { describe, expect, it, vi } from 'vitest';
import { LIVE_ACTIVITY_TOPIC, livePayload, makeApns, providerToken } from '../supabase/functions/ios-push/apns.ts';

async function testKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const p8 = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
  return { p8, publicKey: pair.publicKey };
}
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

describe('providerToken', () => {
  it('is an ES256 JWT APNs can verify: kid, iss = team, iat', async () => {
    const { p8, publicKey } = await testKey();
    const jwt = await providerToken({ p8, keyId: 'ABC123DEFG', teamId: 'B6H2KH4NKJ' }, 1_700_000_000);
    const [h, c, sig] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(JSON.parse(new TextDecoder().decode(fromB64url(c)))).toEqual({ iss: 'B6H2KH4NKJ', iat: 1_700_000_000 });
    expect(fromB64url(sig)).toHaveLength(64); // raw r||s, as JWS wants
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromB64url(sig), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });
});

describe('livePayload', () => {
  it('a start carries the attributes type, asks for an update token, and alerts when it is a reminder', () => {
    expect(livePayload({ key: 'k', action: 'start', state: { phase: 'reminder' }, alert: { title: 'Lunch', body: 'Eat' } }, 100)).toEqual({
      aps: { timestamp: 100, event: 'start', 'content-state': { phase: 'reminder' }, 'attributes-type': 'SunnyAttributes', attributes: {}, 'input-push-token': 1, alert: { title: 'Lunch', body: 'Eat', sound: 'default' } }
    });
  });
  it('an end dismisses now', () => {
    expect(livePayload({ key: 'k', action: 'end' }, 100)).toEqual({ aps: { timestamp: 100, event: 'end', 'dismissal-date': 100 } });
  });
});

describe('makeApns', () => {
  it('posts to the device with Live Activity headers and reuses its provider token', async () => {
    const { p8 } = await testKey();
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const apns = makeApns({ p8, keyId: 'K', teamId: 'T' }, fetchFn as unknown as typeof fetch, () => 1_700_000_000_000);
    expect(await apns.send('abcd', { aps: {} })).toBe(200);
    await apns.send('abcd', { aps: {} });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://api.push.apple.com/3/device/abcd');
    expect(init.headers['apns-topic']).toBe(LIVE_ACTIVITY_TOPIC);
    expect(init.headers['apns-push-type']).toBe('liveactivity');
    const auth = (c: unknown[]) => (c[1] as { headers: Record<string, string> }).headers.authorization;
    expect(auth(fetchFn.mock.calls[1] as unknown[])).toBe(auth(fetchFn.mock.calls[0] as unknown[]));
  });
});
