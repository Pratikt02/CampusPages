import { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { adminApi } from '../../../api/admin.js';
import { useAsync } from '../../../hooks/useAsync.js';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../components/StateViews.jsx';
import { Pagination } from '../../../components/Pagination.jsx';

const languageNames = { en: 'English', hi: 'Hindi', mr: 'Marathi', gu: 'Gujarati' };
const display = (value) => value || '—';

export default function AdminStudents() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const students = useAsync((signal) => adminApi.students({ q: search, page, limit: 10 }, signal), [search, page]);
  const items = students.data?.items ?? [];

  return (
    <div className="page-shell admin-students-shell">
      <header className="dashboard-hero admin-hero">
        <div>
          <span className="eyebrow">Community</span>
          <h1>Students</h1>
          <p className="muted">View student accounts and their academic profile details.</p>
        </div>
        <div className="summary-grid admin-mini-stats">
          <div className="summary-card"><span>Students</span><strong>{students.data?.total ?? '—'}</strong></div>
          <div className="summary-card"><span>Page</span><strong>{students.data ? `${students.data.page} / ${students.data.pages}` : '—'}</strong></div>
        </div>
      </header>

      <section className="card admin-filter-card" role="search" aria-label="Search students">
        <div className="resource-toolbar-head"><span>Find a student</span></div>
        <label className="field admin-student-search" htmlFor="student-search">
          <span>Search by name, email, student ID, or course</span>
          <div className="admin-student-search-wrap">
            <Search size={18} aria-hidden="true" />
            <input id="student-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing to search…" />
          </div>
        </label>
      </section>

      {students.loading && !students.data && <LoadingSkeleton rows={4} />}
      {students.error && <ErrorState message={students.error.message} onRetry={students.reload} />}
      {students.data && items.length === 0 && (
        <EmptyState title={search ? 'No students match your search.' : 'No student accounts yet.'}>
          {search ? 'Try another name, email, ID, or course.' : 'Student profiles will appear here when accounts are created.'}
        </EmptyState>
      )}
      {items.length > 0 && (
        <div className="table-wrap admin-table-wrap">
          <table className="table admin-table admin-students-table">
            <caption className="visually-hidden">Student profiles</caption>
            <thead><tr><th scope="col">Student</th><th scope="col">Student ID</th><th scope="col">Course</th><th scope="col">Semester / branch</th><th scope="col">Language</th><th scope="col">Status</th></tr></thead>
            <tbody>{items.map((student) => (
              <tr key={student.id}>
                <th scope="row" className="title-cell">
                  <div className="admin-student-identity"><span className="admin-student-avatar" aria-hidden="true">{student.name.slice(0, 1).toUpperCase()}</span><span><strong>{student.name}</strong><small>{student.email}</small></span></div>
                </th>
                <td data-label="Student ID">{display(student.studentId)}</td>
                <td data-label="Course">{display(student.course)}</td>
                <td data-label="Semester / branch">{student.semester ? `Semester ${student.semester}` : 'Semester —'} · {display(student.branch)}</td>
                <td data-label="Language">{languageNames[student.preferredLanguage] ?? student.preferredLanguage}</td>
                <td data-label="Status"><span className={`admin-student-status ${student.status === 'active' ? 'is-active' : 'is-disabled'}`}>{student.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {students.data && <Pagination page={students.data.page} pages={students.data.pages} onChange={setPage} />}
      <p className="admin-students-privacy"><Users size={15} aria-hidden="true" /> Student profile information is visible to administrators only.</p>
    </div>
  );
}
