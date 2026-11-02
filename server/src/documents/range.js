// Single-range HTTP Range parsing (RFC 9110). PDF.js and browsers use single byte ranges.
//  - { type: 'none' }                  -> serve the full body (no/ignored Range header)
//  - { type: 'range', start, end }     -> 206 partial, inclusive offsets, end clamped to size-1
//  - { type: 'invalid' }               -> 416 (malformed or unsatisfiable)
// Ignored (full 200): non-"bytes" units, multiple ranges, and any request with If-Range (we send no validators,
// so an If-Range precondition can never be satisfied).
export function parseRange(header, size, hasIfRange = false) {
  if (!header || hasIfRange) return { type: 'none' };
  const m = /^\s*bytes\s*=\s*(.+)$/i.exec(header);
  if (!m) return { type: 'none' };
  if (m[1].includes(',')) return { type: 'none' };
  const r = /^(\d*)\s*-\s*(\d*)$/.exec(m[1].trim());
  if (!r || (r[1] === '' && r[2] === '')) return { type: 'invalid' };
  let start; let end;
  if (r[1] === '') { // suffix: last N bytes
    const n = Number(r[2]);
    if (!Number.isSafeInteger(n) || n === 0) return { type: 'invalid' };
    start = Math.max(size - n, 0); end = size - 1;
  } else {
    start = Number(r[1]); end = r[2] === '' ? size - 1 : Number(r[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return { type: 'invalid' };
    if (start >= size) return { type: 'invalid' };
    end = Math.min(end, size - 1);
  }
  return { type: 'range', start, end };
}
