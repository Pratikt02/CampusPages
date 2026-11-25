import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const ANIMATION_DURATION = 650;

export function ZoomMagnifierOverlay({ trigger, viewportRef }) {
  const [visible, setVisible] = useState(false);
  const [viewport, setViewport] = useState(null);
  const id = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    if (!trigger) return undefined;
    const element = viewportRef.current;
    if (!element) return undefined;
    const updateViewport = () => {
      const rect = element.getBoundingClientRect();
      setViewport({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('scroll', updateViewport, true);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('scroll', updateViewport, true);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, [trigger, viewportRef]);

  useEffect(() => {
    if (!trigger) return undefined;
    setVisible(true);
    const timeout = setTimeout(() => setVisible(false), ANIMATION_DURATION);
    return () => clearTimeout(timeout);
  }, [trigger]);

  if (!trigger || !visible || !viewport) return null;

  return createPortal(
    <div className="zoom-magnifier-overlay" aria-hidden="true"
      style={{ left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height }}>
      <svg key={trigger.id} className={`zoom-magnifier zoom-magnifier--${trigger.direction}`}
        viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <defs>
          <linearGradient id={`${id}-silverBezel`} x1="15" y1="15" x2="125" y2="125" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="28%" stopColor="#CBD5E1" />
            <stop offset="65%" stopColor="#475569" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <radialGradient id={`${id}-glossyBlueLens`} cx="42%" cy="42%" r="58%">
            <stop offset="0%" stopColor="#64748B" stopOpacity="0.48" />
            <stop offset="48%" stopColor="#1E293B" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0.78" />
          </radialGradient>
          <linearGradient id={`${id}-brassCollar`} x1="108" y1="108" x2="124" y2="124" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="50%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
          <linearGradient id={`${id}-woodHandleFade`} x1="118" y1="118" x2="174" y2="174" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9A3412" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#7C2D12" stopOpacity="0.85" />
            <stop offset="80%" stopColor="#451A03" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#451A03" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M107 115L115 107L125 117L117 125L107 115Z" fill={`url(#${id}-brassCollar)`} />
        <path d="M119 127L127 119L176 164L164 176L119 127Z" fill={`url(#${id}-woodHandleFade)`} />
        <circle cx="70" cy="70" r="52" fill={`url(#${id}-glossyBlueLens)`} />
        <circle cx="70" cy="70" r="52" stroke={`url(#${id}-silverBezel)`} strokeWidth="10" />
        <circle cx="70" cy="70" r="47" stroke="#0F172A" strokeWidth="1.5" strokeOpacity="0.65" />
        <path d="M36 51C43 38 56 31 71 31" stroke="#CBD5E1" strokeWidth="3.6" strokeLinecap="round" strokeOpacity="0.65" />
        <circle cx="43" cy="56" r="2.4" fill="#CBD5E1" fillOpacity="0.65" />
      </svg>
    </div>,
    document.body,
  );
}
