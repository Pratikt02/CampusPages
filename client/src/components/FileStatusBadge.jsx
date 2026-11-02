import { CheckCircle2, Clock, FileEdit, Globe, XCircle } from 'lucide-react';

const P = { uploading: [Clock, 'Uploading'], processing: [Clock, 'Processing'], ready: [CheckCircle2, 'Ready'], failed: [XCircle, 'Failed'] };
// Status is conveyed by icon + text, never by color alone.
export function FileStatusBadge({ processing, publication }) {
  const [PI, plabel] = P[processing] ?? [Clock, processing];
  const PubIcon = publication === 'published' ? Globe : FileEdit;
  return (
    <span className="badges">
      <span className={`badge ${processing === 'failed' ? 'badge-bad' : processing === 'ready' ? '' : 'badge-warn'}`}><PI size={14} aria-hidden="true" />{plabel}</span>
      <span className={`badge ${publication === 'published' ? '' : 'badge-neutral'}`}><PubIcon size={14} aria-hidden="true" />{publication === 'published' ? 'Published' : 'Draft'}</span>
    </span>
  );
}
