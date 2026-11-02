import { lazy, Suspense, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { docsApi } from '../../api/documents.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { BrandLogo } from '../../components/BrandLogo.jsx';
import { ThemeToggle } from '../../components/ThemeToggle.jsx';
import { ErrorState, LoadingSkeleton } from '../../components/StateViews.jsx';
import { formatStamp, maskEmail } from './viewMath.js';

// Code-split: PDF.js (large) is only downloaded when a PDF is opened.
const PdfViewer = lazy(() => import('./PdfViewer.jsx'));
const ImageViewer = lazy(() => import('./ImageViewer.jsx'));

export default function ViewerPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { loading, error, data, reload } = useAsync((s) => docsApi.get(id, s), [id]);
  // Identity comes from the authenticated session (/api/auth/me), never from the URL or any query parameter.
  const identity = useMemo(() => `${maskEmail(user?.email)} · ${formatStamp(new Date())}`, [user?.email]);
  const Viewer = data?.fileType === 'image' ? ImageViewer : PdfViewer;
  return (
    <div className="viewer-page">
      <a className="skip" href="#reader">Skip to document</a>
      <header className="viewer-header">
        <Link to="/app" className="btn" aria-label="Back to library"><ArrowLeft size={18} aria-hidden="true" /><span className="back-label">Library</span></Link>
        <h1 className="viewer-title">{data?.title ?? 'Document'}</h1>
        <div className="viewer-brand"><BrandLogo to="/app" /></div>
        <div className="viewer-actions"><ThemeToggle /></div>
      </header>
      <main id="reader" className="viewer-main">
        {loading && <div style={{ padding: '1rem' }}><LoadingSkeleton rows={2} /></div>}
        {error?.status === 404 && <div className="viewer-state"><h2>Document not available</h2><p className="muted">This document doesn’t exist or isn’t published.</p><Link to="/app" className="btn btn-primary">Back to library</Link></div>}
        {error && error.status !== 404 && <ErrorState message={error.message} onRetry={reload} />}
        {data && <Suspense fallback={<div className="viewer-state" role="status"><div className="spinner" aria-hidden="true" />Loading reader…</div>}><Viewer docId={data.id} title={data.title} identity={identity} size={data.fileSize} /></Suspense>}
      </main>
    </div>
  );
}
