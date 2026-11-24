import { useEffect } from 'react';
import { Activity, BookOpen, Clock3, RefreshCw } from 'lucide-react';
import { adminApi } from '../../../api/admin.js';
import { useAsync } from '../../../hooks/useAsync.js';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../components/StateViews.jsx';

const dateTime = (value) => value ? new Date(value).toLocaleString() : '—';

export default function AdminCurrentlyReading() {
  const readers = useAsync((signal) => adminApi.currentlyReading(signal), []);
  useEffect(() => {
    const timer = setInterval(readers.reload, 15_000);
    return () => clearInterval(timer);
  }, [readers.reload]);

  const items = readers.data?.items ?? [];
  return (
    <div className="page-shell admin-reading-shell">
      <header className="dashboard-hero admin-hero">
        <div>
          <span className="eyebrow"><Activity size={14} aria-hidden="true" /> Live library activity</span>
          <h1>Currently reading</h1>
          <p className="muted">See which students are reading published notes right now.</p>
        </div>
        <div className="summary-grid admin-mini-stats">
          <div className="summary-card"><span>Active readers</span><strong>{readers.data ? items.length : '—'}</strong></div>
          <button type="button" className="btn reading-refresh" onClick={readers.reload} disabled={readers.loading}>
            <RefreshCw size={17} aria-hidden="true" className={readers.loading && readers.data ? 'is-spinning' : undefined} />
            Refresh
          </button>
        </div>
      </header>

      <div className="reading-live-note" role="status">
        <span className="reading-live-dot" aria-hidden="true" />
        Updates every 15 seconds. A reader is shown for up to 2 minutes after their last activity.
      </div>

      {readers.loading && !readers.data && <LoadingSkeleton rows={3} />}
      {readers.error && <ErrorState message={readers.error.message} onRetry={readers.reload} />}
      {readers.data && items.length === 0 && (
        <EmptyState title="No students are reading at the moment.">
          Readers will appear here while they have a note open.
        </EmptyState>
      )}
      {items.length > 0 && (
        <div className="table-wrap admin-table-wrap">
          <table className="table admin-table admin-reading-table">
            <caption className="visually-hidden">Students currently reading notes</caption>
            <thead><tr><th scope="col">Student</th><th scope="col">Note</th><th scope="col">Course</th><th scope="col">Started reading</th><th scope="col">Last update</th><th scope="col">Status</th></tr></thead>
            <tbody>{items.map((reader) => (
              <tr key={reader.id}>
                <th scope="row" className="title-cell">
                  <div className="reading-student"><span className="admin-student-avatar" aria-hidden="true">{reader.student.name.slice(0, 1).toUpperCase()}</span><span><strong>{reader.student.name}</strong><small>{reader.student.email}</small></span></div>
                </th>
                <td data-label="Note"><span className="reading-note-title"><BookOpen size={16} aria-hidden="true" />{reader.document.title}</span><small className="reading-subject">{reader.document.subject}</small></td>
                <td data-label="Course">{reader.student.course || '—'}{reader.student.semester ? ` · Sem ${reader.student.semester}` : ''}{reader.student.branch ? ` · ${reader.student.branch}` : ''}</td>
                <td data-label="Started reading"><span className="reading-time"><Clock3 size={15} aria-hidden="true" />{dateTime(reader.startedAt)}</span></td>
                <td data-label="Last update">{dateTime(reader.updatedAt)}</td>
                <td data-label="Status"><span className="reading-live-badge"><span className="reading-live-dot" aria-hidden="true" />Reading</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
