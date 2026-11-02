import { useEffect, useState } from 'react';
import { FileImage, FileText, Pencil, Trash2, Eye, EyeOff, Upload } from 'lucide-react';
import { adminApi } from '../../../api/admin.js';
import { useAsync } from '../../../hooks/useAsync.js';
import { useToast } from '../../../components/Toast.jsx';
import { ConfirmationDialog, Modal } from '../../../components/Modal.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../components/StateViews.jsx';
import { FileStatusBadge } from '../../../components/FileStatusBadge.jsx';
import { Pagination } from '../../../components/Pagination.jsx';
import { formatBytes } from '../../../components/UploadDropzone.jsx';

function EditDialog({ doc, subjects, onClose, onSaved }) {
  const { notify } = useToast();
  const [f, setF] = useState({ title: doc.title, description: doc.description, subjectId: doc.subject?.id ?? '', semester: doc.semester ?? '', academicCategory: doc.academicCategory ?? 'legacy', academicYear: doc.academicYear ?? '', branch: doc.branch ?? '', standard: doc.standard ?? '', course: doc.course ?? '', materialType: doc.materialType ?? 'study-notes' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault();
    if (!f.title.trim()) { setErr('Enter a title.'); return; }
    setBusy(true); setErr('');
    try { const d = await adminApi.update(doc.id, { title: f.title, description: f.description, subjectId: f.subjectId, semester: f.semester === '' ? null : f.semester, academicCategory: f.academicCategory, academicYear: f.academicYear === '' ? null : f.academicYear, branch: f.branch || null, standard: f.standard, course: f.course, materialType: f.materialType }); notify('Changes saved.'); onSaved(d); }
    catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <Modal title="Edit details" onClose={onClose}>
      <form onSubmit={save} noValidate>
        <label className="field"><span>Title</span><input data-autofocus value={f.title} onChange={set('title')} maxLength={200} aria-invalid={!!err} /></label>
        <label className="field"><span>Subject</span><select value={f.subjectId} onChange={set('subjectId')}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field"><span>Academic category</span><select value={f.academicCategory} onChange={set('academicCategory')}><option value="legacy">Uncategorized (legacy)</option><option value="engineering">Engineering</option><option value="other">Other Standards</option></select></label>
        {f.academicCategory === 'engineering' ? <div className="notes-admin-context">
          <label className="field"><span>Academic year</span><select value={f.academicYear} onChange={set('academicYear')}><option value="">Select year…</option>{['1st Year', '2nd Year', '3rd Year', '4th Year'].map((y, i) => <option key={i} value={i + 1}>{y}</option>)}</select></label>
          <label className="field"><span>Branch</span><select value={f.branch} onChange={set('branch')}><option value="">Select branch…</option>{['CS', 'IT', 'ENTC', 'MECH', 'Civil', 'AIDS'].map((b) => <option key={b}>{b}</option>)}</select></label>
        </div> : f.academicCategory === 'other' && <div className="notes-admin-context">
          <label className="field"><span>Standard or class</span><input value={f.standard} onChange={set('standard')} maxLength={100} /></label>
          <label className="field"><span>Course (optional)</span><input value={f.course} onChange={set('course')} maxLength={120} /></label>
        </div>}
        <label className="field"><span>Semester (optional)</span>{f.academicCategory === 'engineering' && f.academicYear ? <select value={f.semester} onChange={set('semester')}><option value="">Not semester-specific</option>{[(Number(f.academicYear) - 1) * 2 + 1, Number(f.academicYear) * 2].map((s) => <option key={s} value={s}>Semester {s}</option>)}</select> : <input type="number" min="1" max="12" value={f.semester} onChange={set('semester')} />}</label>
        <label className="field"><span>Material type</span><select value={f.materialType} onChange={set('materialType')}><option value="study-notes">Study Notes</option><option value="previous-year-question-paper">Previous-Year Question Papers</option><option value="practical-file">Practical Files</option><option value="lab-manual">Lab Manuals</option><option value="syllabus">Syllabus</option></select></label>
        <label className="field"><span>Description</span><textarea rows={3} value={f.description} onChange={set('description')} maxLength={2000} /></label>
        {err && <p role="alert" className="error">{err}</p>}
        <div className="cta-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminDocuments() {
  const { notify } = useToast();
  const [q, setQ] = useState(''); const [dq, setDq] = useState('');
  const [subject, setSubject] = useState(''); const [publication, setPublication] = useState(''); const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); const [deleting, setDeleting] = useState(null); const [busyId, setBusyId] = useState(null);
  const [replacingId, setReplacingId] = useState(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const subjects = useAsync((s) => adminApi.subjects(s), []);
  const list = useAsync((s) => adminApi.list({ q: dq, subject, publication, page, limit: 10 }, s), [dq, subject, publication, page]);

  async function toggle(d) {
    setBusyId(d.id);
    try { await adminApi.publish(d.id, d.publicationStatus !== 'published'); notify(d.publicationStatus === 'published' ? `“${d.title}” unpublished.` : `“${d.title}” published.`); list.reload(); }
    catch (e) { notify(e.message, 'error'); } finally { setBusyId(null); }
  }
  async function remove() {
    setBusyId(deleting.id);
    try { await adminApi.remove(deleting.id); notify(`“${deleting.title}” deleted.`); setDeleting(null); list.reload(); }
    catch (e) { notify(e.message, 'error'); setDeleting(null); list.reload(); } finally { setBusyId(null); }
  }
  async function replaceFile(d, file) {
    if (!file) return;
    setReplacingId(d.id);
    try { await adminApi.replaceFile(d.id, file); notify(`File for “${d.title}” was replaced and verified.`); list.reload(); }
    catch (e) { notify(e.message, 'error'); }
    finally { setReplacingId(null); }
  }
  const items = list.data?.items ?? [];
  const filtered = dq || subject || publication;
  return (
    <div className="page-shell admin-documents-shell">
      <header className="dashboard-hero admin-hero">
        <div>
          <span className="eyebrow">Library overview</span>
          <h1>Documents</h1>
          <p className="muted">Review, publish, and manage every study resource in one place.</p>
        </div>
        <div className="summary-grid admin-mini-stats">
          <div className="summary-card">
            <span>Total</span>
            <strong>{list.data?.total ?? items.length}</strong>
          </div>
          <div className="summary-card">
            <span>Filters</span>
            <strong>{filtered ? 'Active' : 'All'}</strong>
          </div>
        </div>
      </header>

      <div className="card admin-filter-card" role="search">
        <div className="resource-toolbar-head">
          <span>Search & filters</span>
        </div>
        <div className="filters admin-filters">
          <label className="field"><span>Search title</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label className="field"><span>Subject</span>
            <select value={subject} onChange={(e) => { setSubject(e.target.value); setPage(1); }}><option value="">All subjects</option>
              {subjects.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="field"><span>Status</span>
            <select value={publication} onChange={(e) => { setPublication(e.target.value); setPage(1); }}><option value="">All</option><option value="published">Published</option><option value="draft">Draft</option></select></label>
        </div>
      </div>

      {list.loading && !list.data && <LoadingSkeleton rows={4} />}
      {list.error && <ErrorState message={list.error.message} onRetry={list.reload} />}
      {list.data && !items.length && (filtered
        ? <EmptyState title="No documents match your filters.">Try a different search or clear the filters.</EmptyState>
        : <EmptyState title="No documents yet.">Upload your first document to get started.</EmptyState>)}
      {items.length > 0 && (
        <div className="table-wrap admin-table-wrap"><table className="table admin-table" role="table">
          <caption className="visually-hidden">Documents</caption>
          <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Title</th><th scope="col" role="columnheader">Subject</th><th scope="col" role="columnheader">Type</th><th scope="col" role="columnheader">Status</th><th scope="col" role="columnheader">Actions</th></tr></thead>
          <tbody role="rowgroup">{items.map((d) => (
            <tr key={d.id} role="row">
              <th scope="row" role="rowheader" className="title-cell"><div className="doc-title-wrap"><span>{d.title}</span><small className="muted small">{formatBytes(d.fileSize)}{d.pageCount ? ` · ${d.pageCount} pages` : ''}{d.width ? ` · ${d.width}×${d.height}` : ''}</small></div></th>
              <td role="cell" data-label="Subject">{d.subject?.name ?? '—'}</td>
              <td role="cell" data-label="Type">{d.fileType === 'pdf' ? <><FileText size={16} aria-hidden="true" /> PDF</> : <><FileImage size={16} aria-hidden="true" /> Image</>}</td>
              <td role="cell" data-label="Status"><FileStatusBadge processing={d.processingStatus} publication={d.publicationStatus} /></td>
              <td role="cell" data-label="Actions"><div className="row-actions">
                <button type="button" className="btn" onClick={() => toggle(d)} disabled={busyId === d.id || (d.processingStatus !== 'ready' && d.publicationStatus !== 'published')}
                  aria-label={`${d.publicationStatus === 'published' ? 'Unpublish' : 'Publish'} ${d.title}`}>
                  {d.publicationStatus === 'published' ? <><EyeOff size={16} aria-hidden="true" />Unpublish</> : <><Eye size={16} aria-hidden="true" />Publish</>}</button>
                <button type="button" className="btn icon-btn" aria-label={`Edit ${d.title}`} onClick={() => setEditing(d)}><Pencil size={16} aria-hidden="true" /></button>
                <label className="btn icon-btn" aria-label={`Replace file for ${d.title}`} title="Replace file" aria-disabled={replacingId === d.id}>
                  <Upload size={16} aria-hidden="true" />
                  <input className="visually-hidden" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" disabled={replacingId === d.id} aria-label={`Choose replacement file for ${d.title}`} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; replaceFile(d, file); }} />
                </label>
                <button type="button" className="btn icon-btn btn-danger-outline" aria-label={`Delete ${d.title}`} onClick={() => setDeleting(d)}><Trash2 size={16} aria-hidden="true" /></button>
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} />}
      {editing && <EditDialog doc={editing} subjects={subjects.data?.items ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
      {deleting && <ConfirmationDialog danger title="Delete this document?" confirmLabel="Delete permanently" busy={busyId === deleting.id}
        message={`“${deleting.title}” and its stored file will be permanently deleted. This cannot be undone.`} onConfirm={remove} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
