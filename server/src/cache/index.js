import NodeCache from 'node-cache';
// PROCESS-LOCAL metadata cache. Never holds file bytes and is never consulted for authN/authZ decisions.
// With several API instances, each has its own copy: bounded staleness = TTL. Use a shared cache/pub-sub when that matters.
const store = new NodeCache({ stdTTL: 30, checkperiod: 60, useClones: true, maxKeys: 500 });
let version = 0;

export async function cached(key, loader, ttl = 30) {
  const hit = store.get(key);
  if (hit !== undefined) return hit;
  const v0 = version;
  const value = await loader();
  if (v0 === version) { try { store.set(key, value, ttl); } catch { /* cache full: serve uncached */ } } // never store data loaded across an invalidation
  return value;
}
export function invalidate(...prefixes) {
  version += 1;
  for (const k of store.keys()) if (prefixes.some((p) => k.startsWith(p))) store.del(k);
}
export const flushAll = () => { version += 1; store.flushAll(); };
