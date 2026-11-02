import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, MoveHorizontal, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { openPdf, isRenderCancelled } from './pdfjs.js';
import { WatermarkOverlay } from './WatermarkOverlay.jsx';
import { clamp, contentUrl, fitPageScale, fitWidthScale, nextZoom, outputScaleFor } from './viewMath.js';
import { notifyUnauthorized } from '../../api/client.js';

const errorText = (e) => (e?.status === 401 ? 'Your session has expired. Please sign in again.'
  : e?.status === 404 ? 'This document is no longer available.' : 'The document could not be loaded.');

// One page: a placeholder of the right size until it is near the viewport, then a canvas. Far-away pages release their canvas.
function PdfPage({ pdf, pageNumber, scale, base, root, identity, registerEl }) {
  const ref = useRef(null); const canvas = useRef(null);
  const [near, setNear] = useState(false);
  const [dims, setDims] = useState(base);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    registerEl(pageNumber, ref.current);
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: root.current, rootMargin: '150% 0px' });
    io.observe(ref.current);
    return () => { io.disconnect(); registerEl(pageNumber, null); };
  }, [pageNumber, root, registerEl]);

  useEffect(() => {
    const c = canvas.current;
    if (!near) { if (c) { c.width = 0; c.height = 0; } setRendered(false); return undefined; }
    let cancelled = false; let task; let page;
    (async () => {
      try {
        page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const unit = page.getViewport({ scale: 1 });
        setDims({ w: unit.width, h: unit.height });
        const out = outputScaleFor(unit.width * scale, unit.height * scale, window.devicePixelRatio);
        const vp = page.getViewport({ scale: scale * out });
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        task = page.render({ canvasContext: c.getContext('2d'), viewport: vp });
        await task.promise;
        if (!cancelled) { setRendered(true); setFailed(false); }
      } catch (e) { if (!cancelled && !isRenderCancelled(e)) setFailed(true); }
    })();
    return () => { cancelled = true; task?.cancel(); page?.cleanup?.(); }; // cancel obsolete render tasks
  }, [near, scale, pdf, pageNumber]);

  const w = dims.w * scale; const h = dims.h * scale;
  return (
    <div ref={ref} className="pdf-page" data-page={pageNumber} style={{ position: 'relative', width: w, height: h }} aria-busy={near && !rendered && !failed}>
      <canvas ref={canvas} style={{ width: w, height: h }} role="img" aria-label={`Page ${pageNumber}`} />
      {!rendered && <div className="pdf-page-status muted" role={failed ? 'alert' : undefined}>{failed ? `Page ${pageNumber} could not be displayed.` : `Loading page ${pageNumber}…`}</div>}
      <WatermarkOverlay text={identity} width={w} />
    </div>
  );
}

export default function PdfViewer({ docId, title, identity, size: fileSize }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState('page'); const [custom, setCustom] = useState(1);
  const [isMinimized, setIsMinimized] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [current, setCurrent] = useState(1); const [pageInput, setPageInput] = useState('1');
  const scroller = useRef(null); const els = useRef(new Map()); const raf = useRef(0);
  const registerEl = useCallback((n, el) => { if (el) els.current.set(n, el); else els.current.delete(n); }, []);

  useEffect(() => {
    let cancelled = false; let task;
    setState({ status: 'loading' });
    const fail = (e) => { // also reached when a later range request fails (e.g. session ended or document unpublished)
      if (cancelled) return;
      if (e?.status === 401) notifyUnauthorized();
      setState({ status: 'error', error: e }); task?.destroy?.();
    };
    (async () => {
      try {
        task = await openPdf(contentUrl(docId), { length: fileSize, onError: fail });
        const pdf = await task.promise;
        const first = await pdf.getPage(1); const vp = first.getViewport({ scale: 1 });
        if (!cancelled) setState({ status: 'ready', pdf, base: { w: vp.width, h: vp.height } });
      } catch (e) { fail(e); }
    })();
    return () => { cancelled = true; task?.destroy?.(); };
  }, [docId, attempt, fileSize]);

  useEffect(() => {
    const el = scroller.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, [state.status]);

  const base = state.base ?? { w: 1, h: 1 };
  const scale = mode === 'custom' ? custom : mode === 'page' ? fitPageScale(size.w, size.h, base.w, base.h) : fitWidthScale(size.w, base.w);
  const total = state.pdf?.numPages ?? 0;

  const goTo = (n) => {
    const t = clamp(Math.round(n) || 1, 1, Math.max(total, 1)); const el = els.current.get(t);
    if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 8;
    setCurrent(t); setPageInput(String(t));
  };
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const sc = scroller.current; if (!sc) return;
      const line = sc.scrollTop + sc.clientHeight * 0.35; let found = 1;
      for (const [n, el] of els.current) if (el.offsetTop <= line && n >= found) found = n;
      setCurrent(found); if (document.activeElement?.id !== 'page-input') setPageInput(String(found));
    });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const zoom = (dir) => { setCustom(nextZoom(scale, dir)); setMode('custom'); };
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(+1); } else if (e.key === '-') { e.preventDefault(); zoom(-1); } else if (e.key === '0') { e.preventDefault(); setMode('width'); }
  };
  if (state.status === 'loading') return <div className="viewer-state" role="status"><div className="spinner" aria-hidden="true" />Loading document…</div>;
  if (state.status === 'error') {
    return (
      <div className="viewer-state" role="alert"><p><strong>{errorText(state.error)}</strong></p>
        {state.error?.status !== 404 && <button type="button" className="btn" onClick={() => setAttempt((a) => a + 1)}><RefreshCw size={18} aria-hidden="true" />Try again</button>}</div>
    );
  }
  return (
    <section
      className={`viewer ${isMinimized ? 'viewer--minimized' : 'viewer--fullscreen'}`}
      aria-label={`Reader: ${title}`}
    >
      <div className="viewer-toolbar" role="toolbar" aria-label="Document controls">
        <div className="tool-group">
          <button type="button" className="btn icon-btn" aria-label="Previous page" onClick={() => goTo(current - 1)} disabled={current <= 1}><ChevronLeft size={20} aria-hidden="true" /></button>
          <form onSubmit={(e) => { e.preventDefault(); goTo(Number(pageInput)); }} className="page-form">
            <label htmlFor="page-input" className="visually-hidden">Page number</label>
            <input id="page-input" inputMode="numeric" pattern="[0-9]*" value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))} onBlur={() => goTo(Number(pageInput))} />
            <span aria-live="polite">of {total}</span>
          </form>
          <button type="button" className="btn icon-btn" aria-label="Next page" onClick={() => goTo(current + 1)} disabled={current >= total}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <div className="tool-group">
          <button type="button" className="btn icon-btn" aria-label="Zoom out" onClick={() => zoom(-1)} disabled={scale <= 0.25 + 0.001}><ZoomOut size={20} aria-hidden="true" /></button>
          <output className="zoom-label" aria-label="Zoom level">{Math.round(scale * 100)}%</output>
          <button type="button" className="btn icon-btn" aria-label="Zoom in" onClick={() => zoom(+1)} disabled={scale >= 4 - 0.001}><ZoomIn size={20} aria-hidden="true" /></button>
          <button type="button" className="btn icon-btn" aria-label="Fit to width" aria-pressed={mode === 'width'} onClick={() => setMode('width')}><MoveHorizontal size={20} aria-hidden="true" /></button>
          <button type="button" className="btn icon-btn" aria-label="Fit to page" aria-pressed={mode === 'page'} onClick={() => setMode('page')}><Maximize2 size={20} aria-hidden="true" /></button>
          <button
            type="button"
            className="btn icon-btn"
            aria-label={isMinimized ? 'Restore PDF viewer' : 'Minimize PDF viewer'}
            aria-pressed={isMinimized}
            title={isMinimized ? 'Restore viewer' : 'Minimize viewer'}
            onClick={() => setIsMinimized((value) => !value)}
          >
            {isMinimized ? <Maximize2 size={20} aria-hidden="true" /> : <Minimize2 size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {/* Context-menu blocking is a casual-copying deterrent only, not a security boundary. */}
      <div ref={scroller} className="viewer-scroll" tabIndex={0} onScroll={onScroll} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()} aria-label="Document pages. Use plus and minus to zoom, 0 to fit width.">
        <div className="pdf-pages">
          {Array.from({ length: total }, (_, i) => (
            <PdfPage key={i + 1} pdf={state.pdf} pageNumber={i + 1} scale={scale} base={state.base} root={scroller} identity={identity} registerEl={registerEl} />
          ))}
        </div>
      </div>
    </section>
  );
}
