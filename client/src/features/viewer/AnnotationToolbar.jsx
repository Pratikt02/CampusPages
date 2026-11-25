import { useEffect, useRef, useState } from 'react';
import { Check, Highlighter, MousePointer2, Pencil, Trash2, Undo2 } from 'lucide-react';

const tools = [
  { value: 'pan', label: 'Pan', Icon: MousePointer2 },
  { value: 'pencil', label: 'Pencil', Icon: Pencil },
  { value: 'highlighter', label: 'Highlighter', Icon: Highlighter },
  { value: 'tick', label: 'Tick mark', Icon: Check },
];

const RETURN_ANIMATION_MS = 1060;
const returnAnimationDuration = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : RETURN_ANIMATION_MS;

export function AnnotationToolbar({ tool, setTool, color, setColor, strokeWidth, setStrokeWidth, strokes, onUndo, onClear, status }) {
  const colorButton = useRef(null);
  const bucketPanel = useRef(null);
  const safeAreaProbe = useRef(null);
  const closeTimer = useRef(null);
  const [bucket, setBucket] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dipping, setDipping] = useState(false);

  const closeBucket = () => {
    setPaletteOpen(false);
    setDipping(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setBucket((current) => current ? { ...current, exiting: true } : null);
    closeTimer.current = setTimeout(() => setBucket(null), returnAnimationDuration());
  };

  const openBucket = () => {
    const rect = colorButton.current?.getBoundingClientRect();
    if (!rect) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const compact = window.matchMedia?.('(max-width: 639px)').matches ?? window.innerWidth < 640;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportTop = window.visualViewport?.offsetTop || 0;
    const safeBottom = Number.parseFloat(getComputedStyle(safeAreaProbe.current).paddingBottom) || 0;
    const panelWidth = Math.max(1, Math.min(compact ? 190 : 240, viewportWidth - 24));
    const panelHeight = Math.max(1, Math.min(compact ? 195 : 230, viewportHeight - safeBottom - 24));
    const paletteHeight = compact ? 140 : 150;
    const left = Math.max(12, Math.min(
      (viewportWidth - panelWidth) / 2,
      viewportWidth - panelWidth - 12,
    ));
    const usableTop = viewportTop + 12;
    const usableBottom = viewportTop + viewportHeight - safeBottom - 12;
    const top = Math.max(usableTop, Math.min(
      usableTop + (usableBottom - usableTop - panelHeight) / 2,
      usableBottom - panelHeight,
    ));
    setBucket({
      left,
      top,
      width: panelWidth,
      height: panelHeight,
      jumpX: rect.left + rect.width / 2 - (left + panelWidth / 2),
      jumpY: rect.top + rect.height / 2 - (top + panelHeight / 2),
      paletteAbove: top + panelHeight + paletteHeight > viewportTop + viewportHeight - safeBottom - 12
        && top - (viewportTop + 12) >= paletteHeight,
      paletteInline: top + panelHeight + paletteHeight > viewportTop + viewportHeight - safeBottom - 12
        && top - (viewportTop + 12) < paletteHeight,
      exiting: false,
    });
    setPaletteOpen(false);
  };

  const toggleBucket = () => {
    if (bucket && !bucket.exiting) closeBucket();
    else openBucket();
  };

  useEffect(() => {
    if (!bucket || bucket.exiting) return undefined;
    const handlePointerDown = (event) => {
      if (colorButton.current?.contains(event.target) || bucketPanel.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      closeBucket();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeBucket();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [bucket]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const chooseColor = (value) => {
    setColor(value);
    setDipping(true);
    setPaletteOpen(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setDipping(false);
      setBucket((current) => current ? { ...current, exiting: true } : null);
      closeTimer.current = setTimeout(() => setBucket(null), returnAnimationDuration());
    }, 220);
  };

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
        <div className="annotation-setting"><span>Color</span> <button ref={colorButton} type="button" className="annotation-color-trigger"
          aria-label="Color picker" aria-haspopup="dialog" aria-expanded={!!bucket && !bucket.exiting}
          onPointerDown={(event) => event.stopPropagation()} onClick={toggleBucket}>
          <span className="annotation-color-chip" style={{ backgroundColor: color }} aria-hidden="true" />
        </button></div>
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
      <div ref={safeAreaProbe} className="paint-picker-safe-area" aria-hidden="true" />
      {bucket && (
        <>
            <div className={`paint-picker-backdrop${bucket.exiting ? ' is-exiting' : ''}`} aria-hidden="true" />
            <div ref={bucketPanel} className={`paint-picker-panel${bucket.exiting ? ' is-exiting' : ''}`}
              role="dialog" aria-label="Choose pencil color"
              style={{
                left: bucket.left,
                top: bucket.top,
                width: bucket.width,
                height: bucket.height,
                '--jump-x': `${bucket.jumpX}px`,
                '--jump-y': `${bucket.jumpY}px`,
                '--paint-color': color,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}>
              <div className={`paint-picker-palette${bucket.paletteInline ? ' palette-inline' : bucket.paletteAbove ? ' palette-above' : ' palette-below'}${paletteOpen ? ' is-open' : ''}`}
                aria-hidden={!paletteOpen}>
                <span className="paint-picker-hint">Click a color to fill ink:</span>
                {['#2563eb', '#ef4444', '#22c55e', '#facc15', '#1f2937', '#a855f7'].map((value) => (
                  <button key={value} type="button" className="paint-picker-swatch"
                    aria-label={`Use ${value} pencil color`} aria-pressed={color.toLowerCase() === value}
                    style={{ '--swatch-color': value }} tabIndex={paletteOpen ? 0 : -1}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); chooseColor(value); }}>
                    <span aria-hidden="true" />
                    {color.toLowerCase() === value && <Check size={17} aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <button type="button" className={`paint-bucket-button${dipping ? ' is-dipping' : ''}`}
                aria-label={paletteOpen ? 'Close color palette' : 'Open color palette'}
                aria-expanded={paletteOpen} onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setPaletteOpen((open) => !open)}>
                <svg className="paint-bucket-illustration" viewBox="0 0 220 205" role="img" aria-label="Wooden paint bucket with a paintbrush">
                  <defs>
                    <linearGradient id="oak-wood" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0" stopColor="#613514" /><stop offset=".18" stopColor="#b97835" />
                      <stop offset=".48" stopColor="#e0a75c" /><stop offset=".74" stopColor="#a76428" />
                      <stop offset="1" stopColor="#5a3015" />
                    </linearGradient>
                    <linearGradient id="iron-band" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#f4f0e7" /><stop offset=".3" stopColor="#79818a" />
                      <stop offset=".55" stopColor="#d7d9d4" /><stop offset="1" stopColor="#50545a" />
                    </linearGradient>
                    <linearGradient id="brush-handle" x1="0" x2="1">
                      <stop offset="0" stopColor="#643719" /><stop offset=".5" stopColor="#d39a55" />
                      <stop offset="1" stopColor="#7b421f" />
                    </linearGradient>
                    <linearGradient id="lid-wood" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#d49a58" /><stop offset=".48" stopColor="#8c5127" />
                      <stop offset="1" stopColor="#512d18" />
                    </linearGradient>
                    <linearGradient id="paint-gloss" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#fff" stopOpacity=".52" /><stop offset=".35" stopColor="#fff" stopOpacity=".08" />
                      <stop offset="1" stopColor="#000" stopOpacity=".14" />
                    </linearGradient>
                  </defs>
                  <ellipse cx="108" cy="177" rx="66" ry="12" fill="#26180f" opacity=".22" />
                  <g className="paint-ground-splatter" fill="var(--paint-color)">
                    <path d="M24 187q6-8 14-4 7-7 16 0 9-5 18 2 10-4 19 3-13 7-29 8-20 4-38-2zm114 0q8-7 17-2 9-8 18-1 8-5 17 2 9-3 15 3-12 8-28 6-21 2-39-5z" />
                    <circle cx="27" cy="178" r="3" /><circle cx="43" cy="198" r="2.4" />
                    <circle cx="184" cy="178" r="3.2" /><circle cx="198" cy="192" r="2.5" />
                    <path d="m31 183 5-9 2 11zm157-2 5-10 2 12z" />
                  </g>
                  <g className="paint-bucket-lid">
                    <ellipse cx="108" cy="22" rx="70" ry="17" fill="#472713" stroke="#29170e" strokeWidth="3" />
                    <ellipse cx="108" cy="18" rx="64" ry="12" fill="url(#lid-wood)" stroke="#75421f" strokeWidth="2" />
                    <path d="M56 18q48-17 101-3M71 23q34-12 75-5" fill="none" stroke="#edbd79" strokeOpacity=".62" strokeWidth="3" strokeLinecap="round" />
                    <path d="M99 8 97 1q10-6 21 0l-2 9Z" fill="url(#iron-band)" stroke="#50545a" strokeWidth="2" />
                  </g>
                  <path d="M37 53 Q107 35 179 53 L160 169 Q108 185 56 169Z" fill="url(#oak-wood)" stroke="#542d16" strokeWidth="3" />
                  <path d="M54 55 68 172M77 50 86 177M103 47 105 180M129 48 124 178M154 51 142 174" fill="none" stroke="#4b2814" strokeOpacity=".57" strokeWidth="3" />
                  <path d="M61 75q8 17 2 31m21-49q-7 16 1 32m34-37q-8 12-1 26m28-22q-9 12-4 27M70 133q7-11 5-23m48 41q-6-13 0-25m21-36q-5 11 1 20" fill="none" stroke="#f4c27a" strokeOpacity=".35" strokeWidth="2" />
                  <path d="M44 94 Q108 110 172 94 L170 107 Q108 123 46 107Z" fill="url(#iron-band)" stroke="#55595d" strokeWidth="2" />
                  <path d="M52 146 Q108 163 164 146 L162 158 Q108 175 54 158Z" fill="url(#iron-band)" stroke="#55595d" strokeWidth="2" />
                  {[48, 72, 96, 120, 144, 168].map((x) => {
                    const t = (x - 44) / 128;
                    return <circle key={`upper-${x}`} cx={x} cy={100.5 + 32 * t * (1 - t)} r="2.4" fill="#e2e4df" stroke="#45494d" strokeWidth="1" />;
                  })}
                  {[55, 77, 99, 121, 143, 161].map((x) => <circle key={`lower-${x}`} cx={x} cy={160.5 - (x - 108) ** 2 * .0029} r="2.2" fill="#e2e4df" stroke="#45494d" strokeWidth="1" />)}
                  <ellipse cx="108" cy="53" rx="72" ry="22" fill="#512b15" stroke="#392012" strokeWidth="3" />
                  <ellipse cx="108" cy="52" rx="62" ry="15" fill="var(--paint-color)" />
                  <ellipse cx="108" cy="48" rx="51" ry="8" fill="url(#paint-gloss)" />
                  <path d="M53 60q5 18 2 32t5 7q4-5 3-27zm23 1q8 15 3 34t6 6q6-8 2-36zm30 3q5 18 1 36t6 4q6-9 3-37zm30-3q-2 17 1 34t7 2q2-9-1-37zm23-4q-5 16-1 27t6 2l2-23z" fill="var(--paint-color)" />
                  <path d="M53 60q5 18 2 32t5 7q4-5 3-27zm23 1q8 15 3 34t6 6q6-8 2-36zm30 3q5 18 1 36t6 4q6-9 3-37zm30-3q-2 17 1 34t7 2q2-9-1-37zm23-4q-5 16-1 27t6 2l2-23z" fill="url(#paint-gloss)" opacity=".55" />
                  <g className="paint-brush">
                    <path d="m91 49 82-8q10-1 11 8t-9 10l-83 3Z" fill="url(#brush-handle)" stroke="#583319" strokeWidth="2" />
                    <path d="m171 42 13-2 3 17-13 2Z" fill="url(#iron-band)" stroke="#55595d" strokeWidth="2" />
                    <path d="m184 40 11-2q7 6 6 16l-11 3Z" fill="#f3e5c5" stroke="#9e8a68" strokeWidth="2" />
                    <path d="m190 43 9 10" stroke="var(--paint-color)" strokeWidth="6" strokeLinecap="round" />
                    <path d="m112 49 12 1" stroke="#f1ca8c" strokeOpacity=".55" strokeWidth="2" />
                  </g>
                </svg>
              </button>
            </div>
        </>
      )}
    </div>
  );
}
