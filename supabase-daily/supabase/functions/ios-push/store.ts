import type { Device, Store } from './handler.ts';

/** The ios_devices / ios_pushes tables through PostgREST with the service role (RLS keeps everyone else out). */
export type RestCfg = { url: string; serviceKey: string; fetchFn: typeof fetch };

export function makeStore(r: RestCfg): Store {
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: r.serviceKey, authorization: `Bearer ${r.serviceKey}`, 'content-type': 'application/json', ...extra
  });
  const call = async (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) => {
    const res = await r.fetchFn(`${r.url}/rest/v1/${path}`, { ...init, headers: headers(init.headers ?? {}), signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`ios-push: ${init.method ?? 'GET'} ${path.split('?')[0]} → ${res.status}`);
    return res;
  };
  const eq = encodeURIComponent;

  return {
    async getDevice(id) {
      const rows = (await (await call(`ios_devices?device_id=eq.${eq(id)}&select=*`)).json()) as Device[];
      return rows[0] ?? null;
    },
    async upsertDevice(d) {
      await call('ios_devices?on_conflict=device_id', {
        method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...d, updated_at: new Date().toISOString() })
      });
    },
    async deleteDevice(id, userId) {
      await call(`ios_devices?device_id=eq.${eq(id)}&user_id=eq.${eq(userId)}`, { method: 'DELETE' });
    },
    async setTokens(id, secret, patch) {
      const res = await call(`ios_devices?device_id=eq.${eq(id)}&secret=eq.${eq(secret)}`, {
        method: 'PATCH', headers: { prefer: 'return=representation' },
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
      });
      return ((await res.json()) as unknown[]).length > 0;
    },
    async clearToken(id, field) {
      await call(`ios_devices?device_id=eq.${eq(id)}`, { method: 'PATCH', body: JSON.stringify({ [field]: null }) });
    },
    async devicesWithSchedule() {
      return (await (await call('ios_devices?schedule=not.is.null&select=*&limit=5000')).json()) as Device[];
    },
    async claim(id, key, atMs) {
      const res = await call('ios_pushes?on_conflict=device_id,key', {
        method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ device_id: id, key, sent_at: new Date(atMs).toISOString() })
      });
      return ((await res.json()) as unknown[]).length > 0;
    },
    async unclaim(id, key) {
      await call(`ios_pushes?device_id=eq.${eq(id)}&key=eq.${eq(key)}`, { method: 'DELETE' });
    },
    async prune(beforeMs) {
      await call(`ios_pushes?sent_at=lt.${eq(new Date(beforeMs).toISOString())}`, { method: 'DELETE' });
    }
  };
}
