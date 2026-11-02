import { Link, useParams } from 'react-router-dom';
import { docsApi } from '../../api/documents.js';
import { useAsync } from '../../hooks/useAsync.js';
import { ErrorState, LoadingSkeleton } from '../../components/StateViews.jsx';
import { formatBytes } from '../../components/UploadDropzone.jsx';

// Metadata only. The protected PDF/image reader and content delivery arrive in Phases 5-6.
export default function DocumentDetailPage() {
  const { id } = useParams();
  const { loading, error, data, reload } = useAsync((s) => docsApi.get(id, s), [id]);
  return (
    <>
      <p><Link to="/app">← Back to library</Link></p>
      {loading && <LoadingSkeleton rows={2} />}
      {error?.status === 404 && <><h1>Document not available</h1><p className="muted">This document doesn’t exist or isn’t published.</p></>}
      {error && error.status !== 404 && <ErrorState message={error.message} onRetry={reload} />}
      {data && (
        <article className="card">
          <h1>{data.title}</h1>
          <p className="muted">{[data.subject?.name, data.semester ? `Semester ${data.semester}` : null, data.fileType === 'pdf' ? 'PDF' : 'Image'].filter(Boolean).join(' · ')}</p>
          {data.description && <p>{data.description}</p>}
          <p className="muted small">{data.fileType === 'pdf' && data.pageCount ? `${data.pageCount} pages · ` : ''}{formatBytes(data.fileSize)}</p>
          <p className="notice" role="note">The online reader is not available yet. It is added in a later development phase.</p>
        </article>
      )}
    </>
  );
}
