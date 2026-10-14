import type { DueEvent } from './due.ts';

/** Apple Push Notification service, token-based (.p8 key). Live Activity pushes go to the app's bundle id + this suffix. */
export const BUNDLE_ID = 'com.aaronalex.daily';
export const LIVE_ACTIVITY_TOPIC = `${BUNDLE_ID}.push-type.liveactivity`;
export const APNS_HOST = 'https://api.push.apple.com'; // TestFlight and the App Store both use production APNs

export type ApnsKey = { p8: string; keyId: string; teamId: string };
type FetchFn = typeof fetch;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (s: string) => new TextEncoder().encode(s);

function pkcs8(p8: string): Uint8Array {
  const body = p8.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** The provider token APNs wants: an ES256 JWT, valid for up to an hour (Apple rejects ones refreshed too often). */
export async function providerToken(key: ApnsKey, nowSec: number): Promise<string> {
  const header = b64url(text(JSON.stringify({ alg: 'ES256', kid: key.keyId })));
  const claims = b64url(text(JSON.stringify({ iss: key.teamId, iat: nowSec })));
  const signingKey = await crypto.subtle.importKey('pkcs8', pkcs8(key.p8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, text(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

/** The Live Activity push for one due event. A start creates "Sunny today" (push-to-start, iOS 17.2+). */
export function livePayload(e: DueEvent, nowSec: number): Record<string, unknown> {
  const aps: Record<string, unknown> = { timestamp: nowSec, event: e.action };
  if (e.state) aps['content-state'] = e.state;
  if (e.action === 'start') {
    aps['attributes-type'] = 'SunnyAttributes';
    aps.attributes = {};
    aps['input-push-token'] = 1; // ask iOS for this activity's update token too
  }
  if (e.action === 'end') aps['dismissal-date'] = nowSec;
  if (e.alert) aps.alert = { title: e.alert.title, body: e.alert.body, sound: 'default' };
  return { aps };
}

export type Apns = { send(deviceToken: string, payload: Record<string, unknown>): Promise<number> };

/** Sends with a provider token cached for 50 minutes. Returns APNs' HTTP status (410: the token is gone). */
export function makeApns(key: ApnsKey, fetchFn: FetchFn, now: () => number = Date.now): Apns {
  let cached: { token: string; atSec: number } | null = null;
  const bearer = async () => {
    const nowSec = Math.floor(now() / 1000);
    if (!cached || nowSec - cached.atSec > 50 * 60) cached = { token: await providerToken(key, nowSec), atSec: nowSec };
    return cached.token;
  };
  return {
    async send(deviceToken, payload) {
      const res = await fetchFn(`${APNS_HOST}/3/device/${deviceToken}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${await bearer()}`, 'apns-topic': LIVE_ACTIVITY_TOPIC, 'apns-push-type': 'liveactivity',
          'apns-priority': '10', 'content-type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000)
      });
      return res.status;
    }
  };
}
