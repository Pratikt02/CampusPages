import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../../api/admin.js';
import { useAsync } from '../../../hooks/useAsync.js';
import { ErrorState, LoadingSkeleton } from '../../../components/StateViews.jsx';
import { formatBytes } from '../../../components/UploadDropzone.jsx';

export default function AdminDashboard() {
  const { loading, error, data, reload } = useAsync((s) => adminApi.stats(s), []);
  const { loading: activeUsersLoading, error: activeUsersError, data: activeUsers, reload: reloadActiveUsers } = useAsync((s) => adminApi.activeUsers(s), []);
  useEffect(() => {
    const interval = setInterval(reloadActiveUsers, 30_000);
    return () => clearInterval(interval);
  }, [reloadActiveUsers]);
  const cards = [
    ...(data ? [
      ['Total documents', data.total], ['Published', data.published], ['Drafts (ready)', data.drafts],
      ['In progress', data.inProgress], ['Failed', data.failed], ['PDFs', data.pdf], ['Images', data.image], ['Stored size', formatBytes(data.totalBytes)],
    ] : []),
    ['Active students (last 5 min)', activeUsers?.count ?? (activeUsersLoading ? '…' : 'Unavailable')],
  ];
  return (
    <div className="page-shell">
      <header className="dashboard-hero">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Admin overview</h1>
          <p className="muted">Library totals use actual records. Active students are refreshed every 30 seconds.</p>
        </div>

        <div className="summary-grid stats-grid">{cards.map(([k, v]) => (
          <div key={k} className="summary-card stat-card">
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}</div>
      </header>

      {loading && <LoadingSkeleton rows={2} />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {activeUsersError && <ErrorState message={activeUsersError.message} onRetry={reloadActiveUsers} />}
      <div className="cta-row" style={{ marginTop: '1.5rem' }}>
        <Link to="/admin/upload" className="btn btn-primary">Upload a document</Link>
        <Link to="/admin/documents" className="btn">Manage documents</Link>
      </div>
    </div>
  );
}
