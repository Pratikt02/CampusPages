import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Accessible dialog: focus moves in, Tab is trapped, Escape closes, focus returns to the opener.
export function Modal({ title, onClose, children, labelledBy = 'modal-title' }) {
  const ref = useRef(null);
  const titleId = labelledBy || 'modal-title';
  useEffect(() => {
    const opener = document.activeElement;
    const first = ref.current.querySelector('[data-autofocus]') ?? ref.current.querySelector(FOCUSABLE);
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = [...ref.current.querySelectorAll(FOCUSABLE)];
      if (!els.length) return;
      const a = els[0], z = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; opener?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="modal card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} style={{ fontSize: 'var(--step-1)' }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmationDialog({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="muted">{message}</p>
      <div className="cta-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" data-autofocus onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}
