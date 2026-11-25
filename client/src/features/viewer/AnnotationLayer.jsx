import { useRef, useState } from 'react';

const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function strokePath(stroke, width, height) {
  return stroke.points.map(({ x, y }) => `${x * width},${y * height}`).join(' ');
}

export function AnnotationLayer({ page, width, height, strokes = [], tool, color, strokeWidth, onSave, disabled, style }) {
  const svg = useRef(null);
  const active = useRef(null);
  const [preview, setPreview] = useState(null);
  const interactive = !disabled && tool !== 'pan';

  const getPoint = (event) => {
    const rect = svg.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const commit = (stroke) => {
    active.current = null;
    setPreview(null);
    onSave(page, [...strokes, stroke]);
  };
  const onPointerDown = (event) => {
    if (!interactive) return;
    const point = getPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const newStroke = {
      tool,
      color: tool === 'highlighter' ? '#facc15' : color,
      width: tool === 'highlighter' ? Math.max(strokeWidth, 0.012) : strokeWidth,
      points: [point],
    };
    if (tool === 'tick') {
      const size = strokeWidth * 12;
      commit({ ...newStroke, points: [
        point,
        { x: Math.min(1, point.x + size * 0.35), y: Math.min(1, point.y + size * 0.45) },
        { x: Math.min(1, point.x + size), y: Math.max(0, point.y - size * 0.55) },
      ] });
      return;
    }
    active.current = newStroke;
    setPreview(newStroke);
  };
  const onPointerMove = (event) => {
    if (!active.current) return;
    const point = getPoint(event);
    if (!point || pointDistance(active.current.points.at(-1), point) < 0.001) return;
    active.current.points.push(point);
    setPreview({ ...active.current, points: [...active.current.points] });
  };
  const onPointerUp = () => {
    if (active.current) commit(active.current);
  };
  const renderStroke = (stroke, index) => {
    const strokeSize = stroke.width * width;
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      return <circle key={index} cx={point.x * width} cy={point.y * height} r={strokeSize / 2}
        fill={stroke.color} fillOpacity={stroke.tool === 'highlighter' ? 0.35 : 1} />;
    }
    return <polyline key={index} points={strokePath(stroke, width, height)} fill="none" stroke={stroke.color}
      strokeWidth={strokeSize} strokeLinecap="round" strokeLinejoin="round"
      strokeOpacity={stroke.tool === 'highlighter' ? 0.35 : 1} />;
  };

  return (
    <svg ref={svg} className={`annotation-layer${interactive ? ' annotation-layer--active' : ''}`}
      viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label={`Annotations on page ${page}`}
      style={style} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {strokes.map(renderStroke)}
      {preview && renderStroke(preview, 'preview')}
    </svg>
  );
}
