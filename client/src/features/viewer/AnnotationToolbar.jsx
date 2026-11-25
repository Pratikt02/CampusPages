import { Check, Highlighter, MousePointer2, Pencil, Trash2, Undo2 } from 'lucide-react';

const tools = [
  { value: 'pan', label: 'Pan', Icon: MousePointer2 },
  { value: 'pencil', label: 'Pencil', Icon: Pencil },
  { value: 'highlighter', label: 'Highlighter', Icon: Highlighter },
  { value: 'tick', label: 'Tick mark', Icon: Check },
];

export function AnnotationToolbar({ tool, setTool, color, setColor, strokeWidth, setStrokeWidth, strokes, onUndo, onClear, status }) {
  const statusText = status === 'loading' ? 'Loading annotations…'
    : status === 'saving' ? 'Saving annotations…'
      : status === 'saved' ? 'Saved · annotations expire 15 days after the last change'
        : status === 'error' ? 'Annotations could not be saved or loaded. Check your connection.'
          : 'Annotations ready · expire 15 days after the last change';
  return (
    <div className="annotation-toolbar" role="toolbar" aria-label="Annotation tools">
      <div className="annotation-tool-buttons">
        {tools.map(({ value, label, Icon }) => (
          <button key={value} type="button" className={`btn icon-btn${tool === value ? ' annotation-tool-active' : ''}`}
            aria-label={label} aria-pressed={tool === value} onClick={() => setTool(value)} disabled={status === 'loading' || status === 'error'}>
            <Icon size={18} aria-hidden="true" />
          </button>
        ))}
        <label className="annotation-setting">Color <input type="color" aria-label="Pencil color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <label className="annotation-setting">Width <input type="range" aria-label="Stroke width" min="0.002" max="0.02" step="0.002" value={strokeWidth}
          onChange={(event) => setStrokeWidth(Number(event.target.value))} /></label>
        <button type="button" className="btn icon-btn" aria-label="Undo annotation" onClick={onUndo} disabled={!strokes.length}>
          <Undo2 size={18} aria-hidden="true" />
        </button>
        <button type="button" className="btn icon-btn" aria-label="Clear page annotations" onClick={onClear} disabled={!strokes.length}>
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
      <span className={`annotation-status${status === 'error' ? ' annotation-status--error' : ''}`} role="status">{statusText}</span>
    </div>
  );
}
