import { Link } from 'react-router-dom';
import { Calendar, FileImage, FileText, Layers } from 'lucide-react';
import { formatBytes } from './UploadDropzone.jsx';

export function DocumentCard({ doc, headingLevel = 2 }) {
  const H = `h${headingLevel}`;
  const pdf = doc.fileType === 'pdf';
  const Icon = pdf ? FileText : FileImage;
  const detail = [
    pdf && doc.pageCount ? `${doc.pageCount} ${doc.pageCount === 1 ? 'page' : 'pages'}` : null,
    !pdf && doc.width ? `${doc.width}×${doc.height}` : null,
    formatBytes(doc.fileSize)
  ].filter(Boolean).join(' · ');
  const materialLabel = {
    'study-notes': 'Study Notes', 'previous-year-question-paper': 'Previous-Year Paper',
    'practical-file': 'Practical File', 'lab-manual': 'Lab Manual', syllabus: 'Syllabus',
  }[doc.materialType];
  const academic = doc.academicCategory === 'engineering' && doc.academicYear
    ? `${doc.academicYear}${doc.academicYear === 1 ? 'st' : doc.academicYear === 2 ? 'nd' : doc.academicYear === 3 ? 'rd' : 'th'} Year${doc.branch ? ` · ${doc.branch}` : ''}`
    : doc.academicCategory === 'other' ? [doc.standard, doc.course].filter(Boolean).join(' · ') : null;

  return (
    <li className="card doc-card">
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <span className="badge badge-neutral">
          <Icon size={14} aria-hidden="true" />
          {pdf ? 'PDF' : 'Image'}
        </span>
        {materialLabel && <span className="badge badge-neutral doc-material-badge">{materialLabel}</span>}
      </div>
      <H className="card-title">
        <Link to={`/app/documents/${doc.id}`} className="stretched">{doc.title}</Link>
      </H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} className="text-dim small">
          <Layers size={14} aria-hidden="true" />
          <span>{[academic, doc.subject?.name, doc.semester ? `Semester ${doc.semester}` : null].filter(Boolean).join(' · ')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} className="text-dim small">
          <Calendar size={14} aria-hidden="true" />
          <span>{detail} · {new Date(doc.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="doc-card-actions">
          <Link to={`/app/documents/${doc.id}`} className="btn btn-small btn-primary">Preview</Link>
        </div>
      </div>
    </li>
  );
}
