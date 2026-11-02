import { describe, it, expect } from 'vitest';
import { parseRange } from '../src/documents/range.js';

const SIZE = 1000;
describe('parseRange', () => {
  it.each([
    ['bytes=0-99', { type: 'range', start: 0, end: 99 }],
    ['bytes=900-', { type: 'range', start: 900, end: 999 }],
    ['bytes=-100', { type: 'range', start: 900, end: 999 }],
    ['bytes=-5000', { type: 'range', start: 0, end: 999 }],      // suffix longer than file
    ['bytes=990-5000', { type: 'range', start: 990, end: 999 }], // end clamped
    ['bytes=0-0', { type: 'range', start: 0, end: 0 }],
    ['BYTES = 10-19', { type: 'range', start: 10, end: 19 }],
  ])('%s', (h, out) => expect(parseRange(h, SIZE)).toEqual(out));
  it.each(['bytes=1000-', 'bytes=2000-3000', 'bytes=9-2', 'bytes=abc', 'bytes=-', 'bytes=-0', 'bytes=1-2-3', 'bytes=99999999999999999999-'])
    ('invalid/unsatisfiable: %s', (h) => expect(parseRange(h, SIZE)).toEqual({ type: 'invalid' }));
  it('ignores absent headers, other units, multi-range, and If-Range', () => {
    for (const h of [undefined, '', 'items=0-5', 'bytes=0-5,10-15']) expect(parseRange(h, SIZE)).toEqual({ type: 'none' });
    expect(parseRange('bytes=0-5', SIZE, true)).toEqual({ type: 'none' });
  });
});
