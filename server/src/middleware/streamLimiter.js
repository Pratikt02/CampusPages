// Bounds concurrent content streams (global + per user) so a few clients cannot exhaust sockets/memory.
// Process-local: with N API instances the effective global cap is N x the configured value.
export function createStreamLimiter({ global, perUser }) {
  let total = 0; const users = new Map();
  return {
    acquire(userId) {
      const n = users.get(userId) ?? 0;
      if (total >= global || n >= perUser) return null;
      total += 1; users.set(userId, n + 1);
      let done = false;
      return () => { if (done) return; done = true; total -= 1; const c = (users.get(userId) ?? 1) - 1; if (c <= 0) users.delete(userId); else users.set(userId, c); };
    },
    get active() { return total; },
  };
}
