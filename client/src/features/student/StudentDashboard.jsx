import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Filter } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { docsApi } from '../../api/documents.js';
import { publicApi } from '../../api/public.js';
import { useAsync } from '../../hooks/useAsync.js';
import { DocumentCard } from '../../components/DocumentCard.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/StateViews.jsx';
import { Pagination } from '../../components/Pagination.jsx';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const subject = sp.get('subject') ?? '';
  const type = sp.get('type') ?? '';
  const urlQ = sp.get('q') ?? '';
  const page = Math.max(parseInt(sp.get('page'), 10) || 1, 1);
  const [q, setQ] = useState(urlQ);

  const update = (patch, keepPage = false) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries({ ...patch, ...(keepPage ? {} : { page: '' }) })) {
      (v ? next.set(k, v) : next.delete(k));
    }
    setSp(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim() !== urlQ) update({ q: q.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects = useAsync((s) => publicApi.subjects(s), []);
  const docs = useAsync((s) => docsApi.list({ q: urlQ, subject, fileType: type, page: String(page), limit: '12' }, s), [urlQ, subject, type, page]);
  const items = docs.data?.items ?? [];
  const filtered = urlQ || subject || type;
  const summaryCards = [
    { label: 'Resources', value: docs.data?.total ?? items.length },
    { label: 'Subjects', value: subjects.data?.items.length ?? 0 },
    { label: 'Current search', value: filtered ? 'Filtered' : 'All' },
  ];

  return (
    <div className="page-shell">
      <header className="dashboard-hero">
        <div>
          <span className="eyebrow dashboard-eyebrow"><BookOpen size={15} aria-hidden="true" /> Learning portal</span>
          <h1>Welcome, {user.name}</h1>
          <p className="muted">Browse protected study materials, discover new topics, and pick up right where your coursework left off.</p>
        </div>

        <div className="summary-grid" aria-label="Student summary">
          {summaryCards.map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      </header>

      <div className="card resource-toolbar">
        <div className="resource-toolbar-head">
          <Filter size={18} aria-hidden="true" />
          <span><strong>Find your next resource</strong><small>Search by title or narrow the list by subject and file type.</small></span>
        </div>
        <div className="filters" role="search" style={{ marginBlock: 0 }}>
          <label className="field">
            <span>Search titles</span>
            <input type="search" placeholder="e.g., Operating Systems..." value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="field">
            <span>Subject</span>
            <select value={subject} onChange={(e) => update({ subject: e.target.value })}>
              <option value="">All subjects</option>
              {subjects.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>File type</span>
            <select value={type} onChange={(e) => update({ type: e.target.value })}>
              <option value="">All types</option>
              <option value="pdf">PDF</option>
              <option value="image">Image</option>
            </select>
          </label>
        </div>
      </div>

      {docs.loading && !docs.data && <LoadingSkeleton rows={4} />}
      {docs.error && <ErrorState message={docs.error.message} onRetry={docs.reload} />}

      {docs.data && !items.length && (filtered
        ? <EmptyState title="No study materials match your filters.">Try a different search query or subject, or <button type="button" className="linklike" onClick={() => { setQ(''); setSp({}, { replace: true }); }}>clear all filters</button>.</EmptyState>
        : <EmptyState title="No study materials have been published yet.">Check back soon for new updates from your course instructors.</EmptyState>)}

      {items.length > 0 && <>
        <div className="results-header">
          <p className="text-dim small" role="status">
            {docs.data.total} {docs.data.total === 1 ? 'result' : 'results'}
          </p>
        </div>
        <ul className="grid doc-grid" style={{ padding: 0, margin: 0, listStyle: 'none' }}>
          {items.map((d) => <DocumentCard key={d.id} doc={d} />)}
        </ul>
      </>}

      {docs.data && <Pagination page={docs.data.page} pages={docs.data.pages} onChange={(p) => update({ page: String(p) }, true)} />}
    </div>
  );
}
