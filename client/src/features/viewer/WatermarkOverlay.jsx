import { useId } from 'react';

// Visible, tiled, non-interactive overlay. The text comes from the authenticated session (never from the URL).
// It is a deterrent only: anything rendered in a browser can be removed or bypassed by a determined user.
export function WatermarkOverlay({ text, width = 800 }) {
  const id = useId().replace(/:/g, '');
  // Size the tile from the text so it is never clipped at tile edges (pattern content is clipped to its tile).
  const fs = Math.round(Math.min(Math.max(width / 30, 10), 15));
  const cellW = Math.ceil(String(text).length * fs * 0.64) + 40;
  const cellH = Math.round(fs * 8);
  return (
    <svg className="watermark" data-testid="watermark" aria-hidden="true" focusable="false" width="100%" height="100%">
      <defs>
        <pattern id={`wm-${id}`} width={cellW} height={cellH} patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
          <text x={cellW / 2} y={cellH / 2} textAnchor="middle" fontSize={fs} fontWeight="600" fontFamily="Inter, system-ui, sans-serif">{text}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#wm-${id})`} />
    </svg>
  );
}
