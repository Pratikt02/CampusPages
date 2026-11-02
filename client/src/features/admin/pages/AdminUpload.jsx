import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, uploadDocument } from '../../../api/admin.js';
import { useAsync } from '../../../hooks/useAsync.js';
import { useToast } from '../../../components/Toast.jsx';
import { UploadDropzone, precheck } from '../../../components/UploadDropzone.jsx';
import { ErrorState } from '../../../components/StateViews.jsx';

const EMPTY = { title: '', description: '', subjectId: '', semester: '', academicCategory: 'engineering', academicYear: '', branch: '', standard: '', course: '', materialType: 'study-notes' };
const BRANCHES = ['CS', 'IT', 'ENTC', 'MECH', 'Civil', 'AIDS'];
const MATERIAL_TYPES = [['study-notes', 'Study Notes'], ['previous-year-question-paper', 'Previous-Year Question Papers'], ['practical-file', 'Practical Files'], ['lab-manual', 'Lab Manuals'], ['syllabus', 'Syllabus']];

export default function AdminUpload() {
  const { notify } = useToast();
  const subjects = useAsync((s) => adminApi.subjects(s), []);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [fileErr, setFileErr] = useState('');
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState('idle'); // idle | uploading | processing | done | error
  const [intent, setIntent] = useState('draft');
  const [pct, setPct] = useState(0);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const ctl = useRef(null);
  const [newSubject, setNewSubject] = useState('');
  useEffect(() => () => ctl.current?.abort(), []);
  const busy = phase === 'uploading' || phase === 'processing';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const choose = (f) => {
    const msg = precheck(f); setFileErr(msg); setFile(msg ? null : f);
    if (!msg && !form.title) setForm((x) => ({ ...x, title: f.name.replace(/\.[^.]+$/, '') }));
  };
  const validate = () => {
    const e = {};
    if (!file) e.file = 'Choose a file to upload.';
    if (!form.title.trim()) e.title = 'Enter a title.';
    if (!form.subjectId) e.subjectId = 'Choose a subject.';
    if (form.academicCategory === 'engineering' && !form.academicYear) e.academicYear = 'Choose an academic year.';
    if (form.academicCategory === 'engineering' && !form.branch) e.branch = 'Choose a branch.';
    if (form.academicCategory === 'other' && !form.standard.trim()) e.standard = 'Enter a standard or class.';
    if (form.semester && !(Number(form.semester) >= 1 && Number(form.semester) <= 12)) e.semester = 'Semester must be 1 to 12.';
    if (form.academicCategory === 'engineering' && form.semester && form.academicYear) {
      const minSemester = (Number(form.academicYear) - 1) * 2 + 1; const maxSemester = Number(form.academicYear) * 2;
      if (Number(form.semester) < minSemester || Number(form.semester) > maxSemester) e.semester = `Choose semester ${minSemester} or ${maxSemester} for this year.`;
    }
    setErrors(e); return !Object.keys(e).length;
  };
  async function submit(ev) {
    ev.preventDefault();
    if (busy || !validate()) return;
    const fd = new FormData();
    fd.append('title', form.title.trim()); fd.append('subjectId', form.subjectId);
    if (form.description.trim()) fd.append('description', form.description.trim());
    if (form.semester) fd.append('semester', form.semester);
    fd.append('academicCategory', form.academicCategory);
    if (form.academicCategory === 'engineering') {
      fd.append('academicYear', form.academicYear); fd.append('branch', form.branch);
    } else {
      fd.append('standard', form.standard.trim());
      if (form.course.trim()) fd.append('course', form.course.trim());
    }
    fd.append('materialType', form.materialType);
    const publish = ev.nativeEvent.submitter?.value === 'publish';
    setIntent(publish ? 'publish' : 'draft');
    fd.append('publish', String(publish));
    fd.append('file', file); // file last so metadata is parsed first
    ctl.current = new AbortController();
    setPhase('uploading'); setPct(0); setMessage('');
    try {
      const doc = await uploadDocument(fd, { signal: ctl.current.signal, onProgress: setPct, onSent: () => setPhase('processing') });
      setResult(doc); setPhase('done'); notify(`“${doc.title}” was uploaded and verified${doc.publicationStatus === 'published' ? ' and published' : ' as a draft'}.`);
      setFile(null); setForm(EMPTY);
    } catch (e) {
      setPhase('error'); setMessage(e.code === 'ABORTED' ? 'Upload cancelled. If the file had already reached the server it may still appear in Documents.' : e.message);
      if (e.code !== 'ABORTED') notify(e.message, 'error');
    }
  }
  async function addSubject() {
    try { const s = await adminApi.createSubject({ name: newSubject }); setNewSubject(''); subjects.reload(); setForm((f) => ({ ...f, subjectId: s.id })); notify(`Subject “${s.name}” added.`); }
    catch (e) { notify(e.message, 'error'); }
  }

  return (
    <div className="page-shell admin-editor-shell">
      <header className="dashboard-hero admin-hero">
        <div>
          <span className="eyebrow">Content pipeline</span>
          <h1>Upload a document</h1>
          <p className="muted">Choose a course location and material type. Files are validated and stored privately.</p>
        </div>
        <div className="summary-grid admin-mini-stats">
          <div className="summary-card">
            <span>Subjects</span>
            <strong>{subjects.data?.items.length ?? 0}</strong>
          </div>
          <div className="summary-card">
            <span>Status</span>
            <strong>{busy ? 'Working' : 'Ready'}</strong>
          </div>
        </div>
      </header>

      <form onSubmit={submit} noValidate className="card admin-form-panel form-grid">
        <div className="upload-column">
          <UploadDropzone file={file} onFile={choose} disabled={busy} />
          {(fileErr || errors.file) && <p className="error" role="alert">{fileErr || errors.file}</p>}
        </div>
        <div className="upload-column">
          <label className="field"><span>Title</span><input value={form.title} onChange={set('title')} maxLength={200} disabled={busy} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'e-title' : undefined} />
            {errors.title && <span id="e-title" className="error">{errors.title}</span>}</label>
          <label className="field"><span>Academic category</span><select value={form.academicCategory} onChange={(e) => setForm((f) => ({ ...f, academicCategory: e.target.value, academicYear: '', branch: '', standard: '', course: '', semester: '' }))} disabled={busy}><option value="engineering">Engineering</option><option value="other">Other Standards</option></select></label>
          {form.academicCategory === 'engineering' ? <div className="notes-admin-context">
            <label className="field"><span>Academic year</span><select value={form.academicYear} onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value, semester: '' }))} disabled={busy} aria-invalid={!!errors.academicYear}><option value="">Select year…</option>{['1st Year', '2nd Year', '3rd Year', '4th Year'].map((y, i) => <option key={i} value={i + 1}>{y}</option>)}</select>{errors.academicYear && <span className="error">{errors.academicYear}</span>}</label>
            <label className="field"><span>Branch</span><select value={form.branch} onChange={set('branch')} disabled={busy} aria-invalid={!!errors.branch}><option value="">Select branch…</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>{errors.branch && <span className="error">{errors.branch}</span>}</label>
          </div> : <div className="notes-admin-context">
            <label className="field"><span>Standard or class</span><input value={form.standard} onChange={set('standard')} maxLength={100} placeholder="e.g., Class 12, Diploma Year 1" disabled={busy} aria-invalid={!!errors.standard} />{errors.standard && <span className="error">{errors.standard}</span>}</label>
            <label className="field"><span>Course (optional)</span><input value={form.course} onChange={set('course')} maxLength={120} placeholder="e.g., Physics, Computer Science" disabled={busy} /></label>
          </div>}
          <label className="field"><span>Subject</span>
            <select value={form.subjectId} onChange={set('subjectId')} disabled={busy} aria-invalid={!!errors.subjectId} aria-describedby={errors.subjectId ? 'e-subj' : undefined}>
              <option value="">Select a subject…</option>
              {subjects.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {errors.subjectId && <span id="e-subj" className="error">{errors.subjectId}</span>}
          </label>
          {subjects.error && <ErrorState message={subjects.error.message} onRetry={subjects.reload} />}
          <div className="inline-add">
            <label className="field" style={{ marginBottom: 0, flex: 1 }}><span>New subject</span><input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} maxLength={80} /></label>
            <button type="button" className="btn" onClick={addSubject} disabled={newSubject.trim().length < 2 || busy}>Add subject</button>
          </div>
          <label className="field" style={{ marginTop: '1rem' }}><span>Semester (optional)</span>{form.academicCategory === 'engineering' && form.academicYear ? <select value={form.semester} onChange={set('semester')} disabled={busy} aria-invalid={!!errors.semester}><option value="">Not semester-specific</option>{[(Number(form.academicYear) - 1) * 2 + 1, Number(form.academicYear) * 2].map((s) => <option key={s} value={s}>Semester {s}</option>)}</select> : <input type="number" min="1" max="12" value={form.semester} onChange={set('semester')} disabled={busy} aria-invalid={!!errors.semester} />}
            {errors.semester && <span className="error">{errors.semester}</span>}</label>
          <label className="field"><span>Material type</span><select value={form.materialType} onChange={set('materialType')} disabled={busy}>{MATERIAL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Description (optional)</span><textarea rows={3} value={form.description} onChange={set('description')} maxLength={2000} disabled={busy} /></label>
        </div>
        <div className="form-actions upload-status-box">
          {phase === 'uploading' && <div><progress value={pct} max="100" aria-label="Upload progress" /> <span role="status">Uploading… {pct}%</span></div>}
          {phase === 'processing' && <p role="status" style={{ margin: 0 }}>File received. Verifying and storing it securely…</p>}
          {phase === 'error' && <p role="alert" className="error" style={{ margin: 0 }}>{message}</p>}
          {phase === 'done' && result && <p role="status" style={{ margin: 0 }}>Upload confirmed. <Link to="/admin/documents">View in Documents</Link></p>}
          <div className="cta-row">
            {busy ? <button type="button" className={`btn ${intent === 'publish' ? 'btn-primary' : ''}`} disabled aria-live="polite">{phase === 'processing' ? 'Verifying…' : 'Uploading…'}</button> : <>
              <button className="btn" name="intent" value="draft">Save as Draft</button>
              <button className="btn btn-primary" name="intent" value="publish">Publish</button>
            </>}
            {busy && <button type="button" className="btn" onClick={() => ctl.current?.abort()}>Cancel</button>}
          </div>
        </div>
      </form>
    </div>
  );
}
