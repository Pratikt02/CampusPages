import { describe, it, expect } from 'vitest';
import { clampPan, fitPageScale, fitWidthScale, maskEmail, nextZoom, outputScaleFor, zoomAround, MAX_ZOOM, MIN_ZOOM, formatStamp } from './viewMath.js';

describe('zoom and fit', () => {
  it('steps through presets and stops at the limits', () => {
    expect(nextZoom(1, +1)).toBe(1.25); expect(nextZoom(1, -1)).toBe(0.75);
    expect(nextZoom(1.1, +1)).toBe(1.25); expect(nextZoom(1.1, -1)).toBe(1);
    expect(nextZoom(MAX_ZOOM, +1)).toBe(MAX_ZOOM); expect(nextZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
  it('fit-width and fit-page respect padding and aspect ratio', () => {
    expect(fitWidthScale(632, 600, 32)).toBeCloseTo(1);
    expect(fitWidthScale(332, 600, 32)).toBeCloseTo(0.5);           // phone: shrinks the page
    expect(fitPageScale(1000, 532, 600, 800, 32)).toBeCloseTo(0.625); // height-bound
    expect(fitWidthScale(0, 600)).toBe(1);                           // unknown size -> safe default
  });
  it('fit may go below the smallest preset, and zooming out never enlarges', () => {
    expect(fitWidthScale(320, 1600, 16)).toBeCloseTo(0.19, 2);
    expect(fitPageScale(320, 568, 1600, 900, 16)).toBeCloseTo(0.19, 2);
    expect(nextZoom(0.19, -1)).toBe(0.19); expect(nextZoom(0.19, +1)).toBe(0.25);
  });
  it('limits canvas resolution for huge pages', () => {
    expect(outputScaleFor(600, 800, 3)).toBe(2);
    expect(outputScaleFor(600, 800, 1)).toBe(1);
    expect(outputScaleFor(6000, 8000, 2, 16_000_000)).toBeLessThan(1);
    expect(outputScaleFor(6000, 8000, 2, 16_000_000) ** 2 * 6000 * 8000).toBeLessThanOrEqual(16_000_001);
  });
});
describe('pan and zoom-at-point', () => {
  it('clamps pan so content cannot leave the view, and centres smaller content', () => {
    expect(clampPan(999, -999, 1000, 800, 400, 400)).toEqual({ x: 300, y: -200 });
    expect(clampPan(50, 50, 200, 200, 400, 400)).toEqual({ x: 0, y: 0 });
  });
  it('keeps the focus point fixed while zooming', () => {
    const v = { scale: 1, x: 0, y: 0 };
    const z = zoomAround(v, 2, 100, 50);
    expect(z).toEqual({ scale: 2, x: -100, y: -50 });
    expect(zoomAround(v, 99, 0, 0).scale).toBe(MAX_ZOOM);
  });
});
describe('watermark identity helpers', () => {
  it('masks emails without exposing the full address', () => {
    expect(maskEmail('student@example.edu')).toBe('s*****t@example.edu');
    expect(maskEmail('ab@x.org')).toBe('a*@x.org');
    expect(maskEmail('a@x.org')).toBe('a*@x.org');
    expect(maskEmail('')).toBe('signed-in user'); expect(maskEmail(undefined)).toBe('signed-in user'); expect(maskEmail('no-at-sign')).toBe('signed-in user');
    expect(maskEmail('student@example.edu')).not.toContain('tudent');
  });
  it('formats a stable timestamp', () => { expect(formatStamp(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05 09:07'); });
});
