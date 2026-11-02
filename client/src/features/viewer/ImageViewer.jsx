import { useEffect, useRef, useState } from 'react';
import { Maximize2, RefreshCw, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { WatermarkOverlay } from './WatermarkOverlay.jsx';
import { clampPan, contentUrl, fitPageScale, nextZoom, zoomAround, MAX_ZOOM, MIN_ZOOM } from './viewMath.js';
import { notifyUnauthorized } from '../../api/client.js';

const errorText = (s) => (s === 401 ? 'Your session has expired. Please sign in again.' : s === 404 ? 'This document is no longer available.' : 'The image could not be loaded.');

export default function ImageViewer({ docId, title, identity }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [nat, setNat] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 }); const [fit, setFit] = useState(true);
  const stage = useRef(null); const pointers = useRef(new Map()); const gesture = useRef(null);

  useEffect(() => { // fetch with the session cookie; an object URL keeps the bytes in memory only (never a public URL)
    const ctl = new AbortController(); let url;
    setState({ status: 'loading' }); setNat(null); setFit(true);
    (async () => {
      try {
        const res = await fetch(contentUrl(docId), { credentials: 'include', signal: ctl.signal });
        if (!res.ok) { if (res.status === 401) notifyUnauthorized(); throw Object.assign(new Error('http'), { status: res.status }); }
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('not an image');
        url = URL.createObjectURL(blob); setState({ status: 'ready', url });
      } catch (e) { if (e.name !== 'AbortError') setState({ status: 'error', httpStatus: e.status }); }
    })();
    return () => { ctl.abort(); if (url) URL.revokeObjectURL(url); };
  }, [docId, attempt]);

  useEffect(() => {
    const el = stage.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height })); ro.observe(el);
    return () => ro.disconnect();
  }, [state.status]);

  const fitScale = nat ? Math.min(fitPageScale(size.w, size.h, nat.w, nat.h, 16), 1) : 1;
  const scale = fit ? fitScale : view.scale;
  const pos = nat ? (fit ? { x: 0, y: 0 } : clampPan(view.x, view.y, nat.w * scale, nat.h * scale, size.w, size.h)) : { x: 0, y: 0 };
  const apply = (next) => { setFit(false); setView({ scale: next.scale, ...clampPan(next.x, next.y, nat.w * next.scale, nat.h * next.scale, size.w, size.h) }); };
  const zoomTo = (s, cx = 0, cy = 0) => nat && apply(zoomAround({ scale, ...pos }, s, cx, cy));
  const rel = (e) => { const r = stage.current.getBoundingClientRect(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }; };
  const finite = (p) => Number.isFinite(p.x) && Number.isFinite(p.y); // never let a bad coordinate poison the view state

  useEffect(() => { // wheel zoom needs a non-passive listener to prevent page scroll
    const el = stage.current; if (!el || !nat) return undefined;
    const onWheel = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2); };
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel);
  });

  const onDown = (e) => { const p = rel(e); if (!finite(p)) return; stage.current.setPointerCapture?.(e.pointerId); pointers.current.set(e.pointerId, p); gesture.current = null; };
  const onMove = (e) => {
    if (!nat || !pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId), cur = rel(e); if (!finite(cur)) return; pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 1) apply({ scale, x: pos.x + (cur.x - prev.x), y: pos.y + (cur.y - prev.y) });
    else if (pointers.current.size === 2) { // pinch
      const [a, b] = [...pointers.current.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current) zoomTo(scale * (dist / gesture.current), (a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current = dist;
    }
  };
  const onUp = (e) => { pointers.current.delete(e.pointerId); gesture.current = null; };
  const onKey = (e) => {
    const k = e.key; const step = 48;
    if (k === '+' || k === '=') zoomTo(nextZoom(scale, +1)); else if (k === '-') zoomTo(nextZoom(scale, -1)); else if (k === '0') setFit(true);
    else if (k === 'ArrowLeft') apply({ scale, x: pos.x + step, y: pos.y }); else if (k === 'ArrowRight') apply({ scale, x: pos.x - step, y: pos.y });
    else if (k === 'ArrowUp') apply({ scale, x: pos.x, y: pos.y + step }); else if (k === 'ArrowDown') apply({ scale, x: pos.x, y: pos.y - step });
    else return;
    e.preventDefault();
  };

  if (state.status === 'loading') return <div className="viewer-state" role="status"><div className="spinner" aria-hidden="true" />Loading image…</div>;
  if (state.status === 'error') {
    return (
      <div className="viewer-state" role="alert"><p><strong>{errorText(state.httpStatus)}</strong></p>
        {state.httpStatus !== 404 && <button type="button" className="btn" onClick={() => setAttempt((a) => a + 1)}><RefreshCw size={18} aria-hidden="true" />Try again</button>}</div>
    );
  }
  return (
    <section className="viewer" aria-label={`Reader: ${title}`}>
      <div className="viewer-toolbar" role="toolbar" aria-label="Image controls">
        <div className="tool-group">
          <button type="button" className="btn icon-btn" aria-label="Zoom out" onClick={() => zoomTo(nextZoom(scale, -1))} disabled={!nat || scale <= MIN_ZOOM + 0.001}><ZoomOut size={20} aria-hidden="true" /></button>
          <output className="zoom-label" aria-label="Zoom level">{Math.round(scale * 100)}%</output>
          <button type="button" className="btn icon-btn" aria-label="Zoom in" onClick={() => zoomTo(nextZoom(scale, +1))} disabled={!nat || scale >= MAX_ZOOM - 0.001}><ZoomIn size={20} aria-hidden="true" /></button>
          <button type="button" className="btn icon-btn" aria-label="Fit to view" aria-pressed={fit} onClick={() => setFit(true)} disabled={!nat}><Maximize2 size={20} aria-hidden="true" /></button>
          <button type="button" className="btn icon-btn" aria-label="Actual size" onClick={() => zoomTo(1)} disabled={!nat}><RotateCcw size={20} aria-hidden="true" /></button>
        </div>
      </div>
      <div ref={stage} className="image-stage" tabIndex={0} aria-label={`${title}. Drag to pan, scroll or pinch to zoom, plus and minus to zoom, 0 to fit.`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}>
        <img src={state.url} alt={title} draggable={false} onDragStart={(e) => e.preventDefault()}
          onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={() => setState({ status: 'error' })}
          style={nat ? { width: nat.w, height: nat.h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})` } : { visibility: 'hidden' }} />
        <WatermarkOverlay text={identity} width={size.w} />
      </div>
    </section>
  );
}
