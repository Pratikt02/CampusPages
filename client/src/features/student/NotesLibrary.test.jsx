import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotesLibrary from './NotesLibrary.jsx';

const json = (body) => ({ ok: true, status: 200, json: async () => body });

describe('year-wise Notes Library', () => {
  afterEach(() => vi.restoreAllMocks());

  it('browses engineering year and branch, then requests and renders matching published notes', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url === '/api/documents/facets') return json({ standards: [], courses: [] });
      if (url === '/api/public/subjects') return json({ items: [{ id: 'subject-1', name: 'Database Systems' }] });
      if (String(url).startsWith('/api/documents?')) return json({ items: [{ id: 'note-1', title: 'DBMS revision notes', subject: { name: 'Database Systems' }, academicCategory: 'engineering', academicYear: 2, branch: 'IT', semester: 3, materialType: 'study-notes', fileType: 'pdf', fileSize: 4096, pageCount: 5, createdAt: '2026-10-01T00:00:00Z' }], total: 1, page: 1, pages: 1 });
      return json({ items: [] });
    });
    render(<MemoryRouter initialEntries={['/app/notes?category=engineering&year=2']}><NotesLibrary /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /IT/i }));
    expect(await screen.findByText('DBMS revision notes')).toBeInTheDocument();
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('academicCategory=engineering') && String(url).includes('academicYear=2') && String(url).includes('branch=IT'))).toBe(true));
    expect(screen.getByText('2nd Year · IT · Database Systems · Semester 3')).toBeInTheDocument();
  });

  it('shows standards returned by the authenticated catalogue facets', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url === '/api/documents/facets') return json({ standards: ['Class 12'], courses: ['Physics'] });
      return json({ items: [] });
    });
    render(<MemoryRouter initialEntries={['/app/notes?category=other']}><NotesLibrary /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /Class 12/i })).toBeInTheDocument();
  });
});
