import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { LoginRequiredModal } from '../../components/LoginRequiredModal.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/StateViews.jsx';

export const libraryPathFor = (id) => `/app?subject=${encodeURIComponent(id)}`;

// Guests see a Login Required modal for the protected action; signed-in users go straight to the library.
export function useProtectedAction() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);
  const open = (path) => (user ? navigate(path) : setPending(path));
  const modal = pending ? <LoginRequiredModal destination={pending} onClose={() => setPending(null)} /> : null;
  return { open, modal };
}

// headingLevel: card titles must be one level below the page's nearest heading (h2 under an h1, h3 under an h2).
export function SubjectGrid({ state, emptyText, headingLevel = 3 }) {
  const H = `h${headingLevel}`;
  const { open, modal } = useProtectedAction();
  const { loading, error, data, reload } = state;
  if (loading && !data) return <LoadingSkeleton rows={3} />;
  if (error) return <ErrorState message="Subjects could not be loaded." onRetry={reload} />;
  if (!data?.items.length) return <EmptyState title={emptyText ? 'No matching subjects.' : 'No subjects are published yet.'}>{emptyText ?? 'Subjects will appear here once administrators publish study materials.'}</EmptyState>;
  return (
    <>
      <ul className="subject-grid" style={{ padding: 0, margin: 0, listStyle: 'none' }}>
        {data.items.map((s, idx) => (
          <li key={s.id} className={`card subject-card subject-card-reveal subject-card-stagger-${((idx % 8) + 1)}`} style={{ animationDelay: `${idx * 0.08}s` }}>
            <div className="subject-card-media">
              <div className="subject-media-shine" />
              <span className="feature-icon subject-icon"><BookOpen size={24} aria-hidden="true" /></span>
            </div>
            <H className="card-title"><Link to={`/subjects/${s.id}`}>{s.name}</Link></H>
            {s.description && <p className="subject-description">{s.description}</p>}
            <p className="subject-meta">{s.materialCount} {s.materialCount === 1 ? 'study material' : 'study materials'}</p>
            <button type="button" className="btn btn-sm subject-btn" onClick={() => open(libraryPathFor(s.id))} aria-label={`View Notes for ${s.name}`}>
              View Notes <span className="btn-arrow">→</span>
            </button>
          </li>
        ))}
      </ul>
      {modal}
    </>
  );
}
