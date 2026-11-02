// Automated accessibility checks (axe-core) on every major screen and dialog. These catch structural problems (names, labels,
// roles, landmarks, ARIA misuse). They do NOT replace testing with a screen reader and a keyboard, and colour contrast is
// covered separately in styles/contrast.test.js because jsdom has no layout engine.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axe from 'axe-core';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import { AuthProvider } from './features/auth/AuthProvider.jsx';

vi.mock('./features/viewer/pdfjs.js', () => ({ openPdf: vi.fn(), isRenderCancelled: () => false }));
const { openPdf } = await import('./features/viewer/pdfjs.js');
const { default: App } = await import('./App.jsx');

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const ADMIN = { id: '1', name: 'Ada', email: 'ada@example.edu', role: 'admin' };
const STUDENT = { id: '2', name: 'Sam', email: 'sam@example.edu', role: 'student' };
const SUBJECT = { id: 'a1b2c3d4e5f60718293a4b5c', name: 'Operating Systems', slug: 'os', description: 'Processes and memory', materialCount: 2 };
const DOC = { id: 'd1', title: 'Scheduling Notes', description: 'd', subject: { id: SUBJECT.id, name: 'Operating Systems' }, semester: 3, fileType: 'pdf', pageCount: 4, width: null, height: null, fileSize: 2048, createdAt: '2026-01-05T00:00:00Z',
  mimeType: 'application/pdf', processingStatus: 'ready', publicationStatus: 'draft' };
let me;
beforeEach(() => {
  me = null;
  const routes = {
    'GET /api/auth/me': () => (me ? json(200, { user: me, csrfToken: 't' }) : json(401, { error: { message: 'no' } })),
    'GET /api/public/subjects': () => json(200, { items: [SUBJECT] }),
    [`GET /api/public/subjects/${SUBJECT.id}`]: () => json(200, SUBJECT),
    'GET /api/documents': () => json(200, { items: [DOC], page: 1, limit: 12, total: 25, pages: 3 }),
    'GET /api/documents/facets': () => json(200, { standards: ['Class 12'], courses: ['Physics'] }),
    'GET /api/documents/d1': () => json(200, DOC),
    'GET /api/admin/stats': () => json(200, { total: 7, published: 3, drafts: 4, inProgress: 0, failed: 0, pdf: 5, image: 2, totalBytes: 2048 }),
    'GET /api/admin/subjects': () => json(200, { items: [{ id: SUBJECT.id, name: 'Operating Systems', slug: 'os', description: '' }] }),
    'GET /api/admin/documents': () => json(200, { items: [DOC, { ...DOC, id: 'd2', title: 'Broken upload', processingStatus: 'failed' }], page: 1, limit: 10, total: 2, pages: 1 }),
  };
  globalThis.fetch = vi.fn((url, o = {}) => { const h = routes[`${o.method ?? 'GET'} ${url.split('?')[0]}`]; return h ? h(o) : json(404, { error: { message: 'nf' } }); });
  const pdf = { numPages: 3, getPage: vi.fn(async () => ({ getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel() {} }), cleanup() {} })) };
  openPdf.mockResolvedValue({ promise: Promise.resolve(pdf), destroy: vi.fn() });
});
const at = (path) => render(<ThemeProvider><MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter></ThemeProvider>);
const clean = async (container) => {
  const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`)).toEqual([]);
};

describe('axe: public screens', () => {
  it('home (with subjects)', async () => { const { container } = at('/'); await screen.findByRole('link', { name: 'Operating Systems' }); await clean(container); });
  it('home with the mobile menu open', async () => { const { container } = at('/'); await userEvent.click(screen.getByRole('button', { name: /open menu/i })); await clean(container); });
  it('home with the Login Required dialog open', async () => { const { container } = at('/'); await userEvent.click(await screen.findByRole('button', { name: /view notes/i })); await screen.findByRole('dialog'); await clean(container); });
  it('subjects list and subject detail', async () => {
    const a = at('/subjects'); await screen.findByRole('link', { name: 'Operating Systems' }); await clean(a.container); a.unmount();
    const b = at(`/subjects/${SUBJECT.id}`); await screen.findByRole('heading', { name: 'Operating Systems' }); await clean(b.container);
  });
  it('login (empty and with an error), 404', async () => {
    const { container } = at('/login'); await clean(container);
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i })); await screen.findByRole('alert'); await clean(container);
  });
  it('not found', async () => { const { container } = at('/nope'); await screen.findByRole('heading', { name: /page not found/i }); await clean(container); });
});

describe('axe: student screens', () => {
  beforeEach(() => { me = STUDENT; });
  it('dashboard with results and pagination', async () => { const { container } = at('/app'); await screen.findByRole('link', { name: 'Scheduling Notes' }); await clean(container); });
  it('notes library year and branch selection', async () => { const { container } = at('/app/notes'); await screen.findByRole('heading', { name: 'Notes Library' }); await clean(container); });
  it('dashboard empty state', async () => {
    fetch.mockImplementation((u, o = {}) => (u.startsWith('/api/documents') ? json(200, { items: [], page: 1, limit: 12, total: 0, pages: 1 }) : u === '/api/auth/me' ? json(200, { user: STUDENT, csrfToken: 't' }) : json(200, { items: [] })));
    const { container } = at('/app?q=zzz'); await screen.findByText(/no study materials match/i); await clean(container);
  });
  it('PDF reader', async () => { const { container } = at('/app/documents/d1'); await screen.findByRole('toolbar', { name: /document controls/i }); await clean(container); });
  it('unauthorized page', async () => { const { container } = at('/admin'); await screen.findByRole('heading', { name: /don’t have access/i }); await clean(container); });
});

describe('axe: admin screens', () => {
  beforeEach(() => { me = ADMIN; });
  it('dashboard', async () => { const { container } = at('/admin'); await screen.findByText('Total documents'); await clean(container); });
  it('upload form (with validation errors showing)', async () => {
    const { container } = at('/admin/upload'); await screen.findByLabelText('Title'); await clean(container);
    await userEvent.click(screen.getByRole('button', { name: /save as draft/i })); await screen.findByText(/choose a subject/i); await clean(container);
  });
  it('documents table, edit dialog and delete confirmation', async () => {
    const { container } = at('/admin/documents'); await screen.findByRole('rowheader', { name: /scheduling notes/i }); await clean(container);
    await userEvent.click(screen.getByRole('button', { name: /edit scheduling notes/i })); await screen.findByRole('dialog', { name: /edit details/i }); await clean(container);
    await userEvent.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /delete scheduling notes/i })); await screen.findByRole('dialog', { name: /delete this document/i }); await clean(container);
  });
});
