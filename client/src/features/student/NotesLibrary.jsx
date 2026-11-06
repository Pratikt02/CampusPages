import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, GraduationCap, Search } from 'lucide-react';
import { docsApi } from '../../api/documents.js';
import { publicApi } from '../../api/public.js';
import { useAsync } from '../../hooks/useAsync.js';
import { DocumentCard } from '../../components/DocumentCard.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/StateViews.jsx';
import { Pagination } from '../../components/Pagination.jsx';

const BRANCHES = ['CS', 'IT', 'ENTC', 'MECH', 'Civil', 'AIDS'];
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const TYPES = [
  ['study-notes', 'Study Notes'], ['previous-year-question-paper', 'Previous-Year Papers'],
  ['practical-file', 'Practical Files'], ['lab-manual', 'Lab Manuals'], ['syllabus', 'Syllabus'],
];

export default function NotesLibrary() {
  const [initialParams] = useSearchParams();
  const [category, setCategory] = useState(() => ['engineering', 'other', 'legacy'].includes(initialParams.get('category')) ? initialParams.get('category') : '');
  const [year, setYear] = useState(() => /^[1-4]$/.test(initialParams.get('year') ?? '') ? initialParams.get('year') : '');
  const [branch, setBranch] = useState(() => BRANCHES.includes(initialParams.get('branch')) ? initialParams.get('branch') : '');
  const [standard, setStandard] = useState(() => initialParams.get('standard') ?? '');
  const [course, setCourse] = useState('');
  const [semester, setSemester] = useState('');
  const [subject, setSubject] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [sort, setSort] = useState('newest');
  const [q, setQ] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);
  const facets = useAsync((signal) => docsApi.facets(signal), []);
  const subjects = useAsync((signal) => publicApi.subjects(signal), []);
  const canList = category === 'engineering' ? !!year && !!branch : category === 'other' ? !!standard : category === 'legacy';
  const params = useMemo(() => ({
    academicCategory: category, academicYear: year, branch, standard, course, semester, subject,
    materialType, sort, q: searchTerm, page: String(page), limit: '12',
  }), [category, year, branch, standard, course, semester, subject, materialType, sort, searchTerm, page]);
  const docs = useAsync((signal) => canList ? docsApi.list(params, signal) : Promise.resolve(null), [canList, params]);
  const resetPage = (setter) => (value) => { setter(value); setPage(1); };
  const semesters = category === 'engineering' ? [1, 2].map((n) => (Number(year) - 1) * 2 + n) : Array.from({ length: 12 }, (_, i) => i + 1);
  const sectionLabel = category === 'engineering'
    ? `${YEARS[Number(year) - 1]}${branch ? ` · ${branch}` : ''}`
    : category === 'other' ? [standard, course].filter(Boolean).join(' · ') : category === 'legacy' ? 'Existing materials' : '';

  const back = () => {
    if (category === 'engineering' && branch) { setBranch(''); setSemester(''); setSubject(''); setMaterialType(''); }
    else if (category === 'engineering' && year) setYear('');
    else { setCategory(''); setYear(''); setBranch(''); setStandard(''); setCourse(''); }
    setPage(1);
  };

  return (
    <div className="page-shell notes-library">
      <header className="dashboard-hero notes-library-hero">
        <div>
          <span className="eyebrow">CampusPages collection</span>
          <h1>Notes Library</h1>
          <p className="muted">Browse published learning materials by academic year, branch, semester, and subject.</p>
        </div>
          <div className="notes-library-mark" aria-hidden="true"><span className="notes-library-mark-icon"><BookOpen size={25} /></span><span><small>YOUR STUDY SPACE</small>One library<br />for every course</span></div>
      </header>

      <nav className="notes-breadcrumbs" aria-label="Notes library path">
        <Link to="/app">Library</Link><span aria-hidden="true">/</span>
        {!category ? <strong>Notes Library</strong> : <button type="button" onClick={() => { setCategory(''); setYear(''); setBranch(''); setStandard(''); setCourse(''); }}>Notes Library</button>}
        {category && <><span aria-hidden="true">/</span><strong>{category === 'engineering' ? 'Engineering' : category === 'other' ? 'Other Standards' : 'Existing Materials'}</strong></>}
        {sectionLabel && <><span aria-hidden="true">/</span><strong>{sectionLabel}</strong></>}
        {category && <button type="button" className="notes-back" onClick={back}><ArrowLeft size={15} /> Back</button>}
      </nav>

      {!category && <section aria-labelledby="notes-category-title">
        <div className="section-header-row"><div><span className="eyebrow">Choose your pathway</span><h2 id="notes-category-title">Explore study materials</h2></div></div>
        <div className="notes-choice-grid">
          <button type="button" className="notes-choice-card notes-choice-engineering" onClick={() => setCategory('engineering')}>
            <span className="notes-choice-icon"><GraduationCap size={25} /></span><span><strong>Engineering</strong><small>Four academic years · six branches</small></span><span className="notes-choice-arrow">→</span>
          </button>
          <button type="button" className="notes-choice-card notes-choice-other" onClick={() => setCategory('other')}>
            <span className="notes-choice-icon"><BookOpen size={23} /></span><span><strong>Other Standards</strong><small>Schools, classes, and other courses</small></span><span className="notes-choice-arrow">→</span>
          </button>
          <button type="button" className="notes-choice-card" onClick={() => setCategory('legacy')}>
            <span className="notes-choice-icon"><BookOpen size={23} /></span><span><strong>Existing Materials</strong><small>Previously published resources without year or class details</small></span><span className="notes-choice-arrow">→</span>
          </button>
        </div>
      </section>}

      {category === 'engineering' && !year && <section aria-labelledby="notes-year-title">
        <div className="section-header-row"><div><span className="eyebrow">Engineering pathway</span><h2 id="notes-year-title">Select academic year</h2></div></div>
        <div className="notes-year-grid">{YEARS.map((name, i) => <button type="button" key={name} className="notes-year-card" onClick={() => { setYear(String(i + 1)); setPage(1); }}>
          <span className="notes-year-number">0{i + 1}</span><strong>{name}</strong><small>CS · IT · ENTC · MECH · Civil · AIDS</small><span className="notes-choice-arrow">→</span>
        </button>)}</div>
      </section>}

      {category === 'engineering' && year && !branch && <section aria-labelledby="notes-branch-title">
        <div className="section-header-row"><div><span className="eyebrow">{YEARS[Number(year) - 1]}</span><h2 id="notes-branch-title">Choose a branch</h2></div></div>
        <div className="notes-branch-grid">{BRANCHES.map((item) => <button type="button" key={item} className="notes-branch-card" onClick={() => { setBranch(item); setPage(1); }}><strong>{item}</strong><span>Browse notes <span aria-hidden="true">→</span></span></button>)}</div>
      </section>}

      {category === 'other' && <section aria-labelledby="other-standard-title">
        <div className="section-header-row"><div><span className="eyebrow">Flexible course catalogue</span><h2 id="other-standard-title">Choose a standard or class</h2><p className="muted">Standards and courses appear here as administrators publish materials for them.</p></div></div>
        {facets.error && <ErrorState message={facets.error.message} onRetry={facets.reload} />}
        {(facets.data?.standards?.length ?? 0) > 0 ? <div className="notes-branch-grid">{facets.data.standards.map((item) => <button type="button" key={item} className={`notes-branch-card${standard === item ? ' selected' : ''}`} onClick={() => { setStandard(item); setCourse(''); setPage(1); }}><strong>{item}</strong><span>View materials <span aria-hidden="true">→</span></span></button>)}</div> : !facets.loading && <EmptyState title="No other standards published yet.">New classes and courses will appear here after materials are published.</EmptyState>}
      </section>}

      {canList && <section className="notes-results" aria-labelledby="notes-results-title">
        <div className="section-header-row"><div><span className="eyebrow">{sectionLabel}</span><h2 id="notes-results-title">Published materials</h2></div></div>
        <div className="card resource-toolbar notes-filter-toolbar">
          <div className="filters notes-filters" role="search">
            <label className="field"><span>Search title or topic</span><span className="notes-search"><Search size={17} /><input type="search" placeholder="Search notes…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></span></label>
            {category === 'other' && <label className="field"><span>Course</span><select value={course} onChange={(e) => resetPage(setCourse)(e.target.value)}><option value="">All courses</option>{(facets.data?.courses ?? []).map((value) => <option key={value}>{value}</option>)}</select></label>}
            <label className="field"><span>Semester</span><select value={semester} onChange={(e) => resetPage(setSemester)(e.target.value)}><option value="">All semesters</option>{semesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}</select></label>
            <label className="field"><span>Subject</span><select value={subject} onChange={(e) => resetPage(setSubject)(e.target.value)}><option value="">All subjects</option>{(subjects.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="field"><span>Material type</span><select value={materialType} onChange={(e) => resetPage(setMaterialType)(e.target.value)}><option value="">All material types</option>{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field"><span>Sort by</span><select value={sort} onChange={(e) => resetPage(setSort)(e.target.value)}><option value="newest">Newest uploads</option><option value="oldest">Oldest uploads</option></select></label>
          </div>
        </div>
        {docs.loading && !docs.data && <LoadingSkeleton rows={4} />}
        {docs.error && <ErrorState message={docs.error.message} onRetry={docs.reload} />}
        {docs.data && !docs.data.items.length && <EmptyState title="No published materials here yet.">Try another semester or filter, or check back when more course material is available.</EmptyState>}
        {!!docs.data?.items.length && <>
          <p className="text-dim small" role="status">{docs.data.total} {docs.data.total === 1 ? 'material' : 'materials'} in this section</p>
          <ul className="grid doc-grid" style={{ padding: 0, margin: 0, listStyle: 'none' }}>{docs.data.items.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}</ul>
          <Pagination page={docs.data.page} pages={docs.data.pages} onChange={(p) => setPage(p)} />
        </>}
      </section>}
    </div>
  );
}
