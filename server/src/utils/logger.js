// Minimal structured logger with defensive redaction. Callers should never pass secrets, but this is a safety net:
// sensitive keys are masked and credential/signature-bearing URLs are scrubbed from string values.
const SENSITIVE_KEY = /pass(word)?|token|secret|cookie|authorization|credential|signature|api[-_]?key|url|uri|key$/i;
const SCRUBS = [
  [/[a-z][a-z0-9+.-]*:\/\/[^\s"']*/gi, '[url]'],       // any URL (may carry credentials or signatures)
  [/s--[\w-]{6,}--/g, '[sig]'],                            // Cloudinary signed-URL segment
  [/(cp_sid|__Host-cp_sid)=[^;\s]+/g, '$1=[redacted]'],  // session cookie
];
export function redact(value, depth = 0) {
  if (typeof value === 'string') return SCRUBS.reduce((v, [re, to]) => v.replace(re, to), value).slice(0, 300);
  if (value === null || typeof value !== 'object' || depth > 3) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)]));
}
const write = (level, msg, meta = {}) =>
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({ t: new Date().toISOString(), level, msg: redact(String(msg)), ...redact(meta) }));
export const log = {
  info: (m, x) => write('info', m, x),
  warn: (m, x) => write('warn', m, x),
  error: (m, x) => write('error', m, x),
};
