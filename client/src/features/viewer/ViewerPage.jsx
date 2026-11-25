import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../api/client.js';
import { docsApi } from '../../api/documents.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { BrandLogo } from '../../components/BrandLogo.jsx';
import { ThemeToggle } from '../../components/ThemeToggle.jsx';
import { ErrorState, LoadingSkeleton } from '../../components/StateViews.jsx';
import { useDailyReadingMilestones } from './useDailyReadingMilestones.js';
import { useAnnotations } from './useAnnotations.js';
import ReadingMilestoneCelebration from '../../components/ReadingMilestoneCelebration.jsx';

// Code-split: PDF.js (large) is only downloaded when a PDF is opened.
const PdfViewer = lazy(() => import('./PdfViewer.jsx'));
const ImageViewer = lazy(() => import('./ImageViewer.jsx'));

export default function ViewerPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { loading, error, data, reload } = useAsync((s) => docsApi.get(id, s), [id]);
  const annotations = useAnnotations(id, Boolean(data && data.id === id && !loading && !error));
  const [readingError, setReadingError] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [milestone, setMilestone] = useDailyReadingMilestones(
    Boolean(data && data.id === id && !loading && !error && !celebrationOpen),
    user?.id,
  );
  useEffect(() => {
    if (milestone !== null) setCelebrationOpen(true);
  }, [milestone]);
  const closeCelebration = useCallback(() => {
    setCelebrationOpen(false);
    setMilestone(null);
  }, [setMilestone]);
  useEffect(() => {
    if (!data || data.id !== id) return undefined;
    let mounted = true;
    let active = false;
    let interval = null;
    let inFlightHeartbeats = 0;
    let stopAfterHeartbeats = false;
    const readingToken = globalThis.crypto.randomUUID();
    const stopRequest = () => {
      api(`/auth/reading/${encodeURIComponent(data.id)}/${encodeURIComponent(readingToken)}`, {
        method: 'DELETE',
        keepalive: true,
      }).catch((e) => {
        if (mounted && e.name !== 'AbortError') setReadingError(true);
      });
    };
    const heartbeat = async () => {
      if (!mounted || !active || document.hidden) return;
      inFlightHeartbeats += 1;
      try {
        await api('/auth/reading', { method: 'POST', body: { documentId: data.id, readingToken } });
        if (mounted) setReadingError(false);
      } catch (e) {
        if (mounted && e.status !== 401) setReadingError(true);
      } finally {
        inFlightHeartbeats -= 1;
        if (inFlightHeartbeats === 0 && stopAfterHeartbeats) {
          stopAfterHeartbeats = false;
          if (!active || document.hidden) stopRequest();
        }
      }
    };
    const stopReading = () => {
      if (!active) return;
      active = false;
      if (interval !== null) clearInterval(interval);
      interval = null;
      stopAfterHeartbeats = inFlightHeartbeats > 0;
      stopRequest();
    };
    const startReading = () => {
      if (!mounted || document.hidden || active) return;
      active = true;
      heartbeat();
      interval = setInterval(heartbeat, 60_000);
    };
    const onVisibilityChange = () => {
      if (document.hidden) stopReading();
      else startReading();
    };
    const onPageHide = () => stopReading();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    startReading();
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      stopReading();
    };
  }, [data, id]);
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
        {readingError && <p className="muted" role="status">Reading status couldn’t be updated. Check your connection.</p>}
        {loading && <div style={{ padding: '1rem' }}><LoadingSkeleton rows={2} /></div>}
        {error?.status === 404 && <div className="viewer-state"><h2>Document not available</h2><p className="muted">This document doesn’t exist or isn’t published.</p><Link to="/app" className="btn btn-primary">Back to library</Link></div>}
        {error && error.status !== 404 && <ErrorState message={error.message} onRetry={reload} />}
        {data && <Suspense fallback={<div className="viewer-state" role="status"><div className="spinner" aria-hidden="true" />Loading reader…</div>}><Viewer docId={data.id} title={data.title} size={data.fileSize} annotations={annotations} /></Suspense>}
      </main>
      <ReadingMilestoneCelebration
        isOpen={celebrationOpen}
        onClose={closeCelebration}
        durationLabel={milestone > 1 ? `${milestone}h` : '1h'}
        subtitle={`You completed ${milestone ?? 1} ${milestone === 1 ? 'hour' : 'hours'} of reading!`}
      />
    </div>
  );
}
