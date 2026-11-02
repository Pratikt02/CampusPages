import { useMemo, useState } from 'react';
import { publicApi } from '../api/public.js';
import { useAsync } from '../hooks/useAsync.js';
import { SubjectGrid } from '../features/subjects/SubjectGrid.jsx';
import { Search, X } from 'lucide-react';

export default function SubjectsPage() {
  const state = useAsync((s) => publicApi.subjects(s), []);
  const [query, setQuery] = useState('');
  const filteredState = useMemo(() => ({
    ...state,
    data: state.data ? {
      ...state.data,
      items: state.data.items.filter((subject) =>
        `${subject.name} ${subject.description ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),
    } : state.data,
  }), [state, query]);
  return (
    <section className="section subjects-page" aria-labelledby="subjects-page-h">
      <div className="subjects-hero">
        <div className="subjects-glow subjects-glow-1" />
        <div className="subjects-glow subjects-glow-2" />
        <div className="subjects-glow subjects-glow-3" />
        <div className="container">
          <div className="subjects-hero-content">
            <span className="eyebrow">Explore subjects</span>
            <h1 id="subjects-page-h">Discover study material by discipline</h1>
            <p className="muted">Find the study materials you need for your next class or exam.</p>
          </div>
          <div className="subjects-search-wrap">
            <div className="subjects-search">
              <Search size={20} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search subjects…"
                className="subjects-search-input"
                aria-label="Search subjects"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && <button type="button" className="subjects-search-clear" aria-label="Clear subject search" onClick={() => setQuery('')}><X size={18} aria-hidden="true" /></button>}
            </div>
          </div>
        </div>
      </div>
      <div className="container">
        <SubjectGrid state={filteredState} headingLevel={2} emptyText={query ? `No subjects match “${query.trim()}”. Try another search.` : undefined} />
      </div>
    </section>
  );
}
