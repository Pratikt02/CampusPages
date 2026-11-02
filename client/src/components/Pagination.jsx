import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn" onClick={() => onChange(page - 1)} disabled={page <= 1}><ChevronLeft size={18} aria-hidden="true" />Previous</button>
      <span aria-current="page">Page {page} of {pages}</span>
      <button type="button" className="btn" onClick={() => onChange(page + 1)} disabled={page >= pages}>Next<ChevronRight size={18} aria-hidden="true" /></button>
    </nav>
  );
}
