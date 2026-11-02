import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
export const MAX_MB = 10;
export const formatBytes = (n) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
// Client-side checks are only a convenience; the server re-validates extension, signature, MIME, size and structure.
export function precheck(file) {
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) return 'Unsupported file type. Choose a PDF, JPEG, PNG or WebP file.';
  if (file.size > MAX_MB * 1024 * 1024) return `File is too large (${formatBytes(file.size)}). The maximum is ${MAX_MB} MB.`;
  if (file.size === 0) return 'The file is empty.';
  return '';
}

export function UploadDropzone({ file, onFile, disabled }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const pick = (f) => f && onFile(f);
  return (
    <div className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) pick(e.dataTransfer.files?.[0]); }}>
      <UploadCloud size={32} aria-hidden="true" />
      <p style={{ margin: 0 }}><strong>Drag a file here</strong> or</p>
      <input ref={input} id="file-input" className="visually-hidden" type="file" accept={ACCEPT} disabled={disabled}
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <label htmlFor="file-input" className={`btn${disabled ? ' disabled' : ''}`}>Choose file</label>
      <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>PDF, JPEG, PNG or WebP · up to {MAX_MB} MB</p>
      {file && <p style={{ margin: 0 }} data-testid="file-summary"><strong>{file.name}</strong> · {formatBytes(file.size)}</p>}
    </div>
  );
}
