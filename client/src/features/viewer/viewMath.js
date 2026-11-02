// Pure helpers shared by the PDF and image viewers (unit-tested; no DOM).
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];
export const FIT_MIN = 0.05; // fitting may go below the smallest zoom preset (e.g. a 1600px image on a 320px phone)
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Next preset zoom level above/below the current scale (dir = +1 / -1).
export function nextZoom(scale, dir) {
  const eps = 0.001;
  if (dir > 0) return ZOOM_STEPS.find((z) => z > scale + eps) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((z) => z < scale - eps) ?? Math.min(scale, MIN_ZOOM); // never zoom "out" to a larger size
}
export const fitWidthScale = (viewW, contentW, pad = 32) => (viewW > 0 && contentW > 0 ? clamp((viewW - pad) / contentW, FIT_MIN, MAX_ZOOM) : 1);
export const fitPageScale = (viewW, viewH, contentW, contentH, pad = 32) =>
  viewW > 0 && viewH > 0 && contentW > 0 && contentH > 0
    ? clamp(Math.min((viewW - pad) / contentW, (viewH - pad) / contentH), FIT_MIN, MAX_ZOOM) : 1;

// Limits canvas memory: shrink the device pixel ratio until width*height*ratio^2 <= maxPixels.
export function outputScaleFor(widthCss, heightCss, dpr = 1, maxPixels = 16_000_000) {
  const wanted = clamp(dpr || 1, 1, 2);
  const cap = Math.sqrt(maxPixels / Math.max(widthCss * heightCss, 1));
  return Math.max(Math.min(wanted, cap), 0.25);
}

// Keeps panned content from being lost: when larger than the view it may not expose empty space beyond its edges; when smaller it centres.
export function clampPan(x, y, contentW, contentH, viewW, viewH) {
  const lim = (c, v) => Math.max((c - v) / 2, 0);
  return { x: clamp(x, -lim(contentW, viewW), lim(contentW, viewW)), y: clamp(y, -lim(contentH, viewH), lim(contentH, viewH)) };
}
// Zoom while keeping the point (cx, cy) - given relative to the view centre - fixed on screen.
export function zoomAround(view, nextScale, cx, cy) {
  const s = clamp(nextScale, MIN_ZOOM, MAX_ZOOM); const k = s / view.scale;
  return { scale: s, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k };
}

// "student@example.edu" -> "s*****t@example.edu": identifies the viewer without printing the full address.
export function maskEmail(email) {
  const [local = '', domain = ''] = String(email ?? '').split('@');
  if (!domain) return 'signed-in user';
  const head = local.slice(0, 1), tail = local.length > 2 ? local.slice(-1) : '';
  return `${head}${'*'.repeat(Math.max(Math.min(local.length - head.length - tail.length, 6), 1))}${tail}@${domain}`;
}
export const formatStamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const contentUrl = (id) => `/api/documents/${encodeURIComponent(id)}/content`;
