import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider } from '../../components/ThemeProvider.jsx';
import { AuthProvider } from '../auth/AuthProvider.jsx';
import App from '../../App.jsx';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const ADMIN = { id: '1', name: 'Ada Admin', email: 'a@x.edu', role: 'admin' };
const DOC = { id: 'd1', title: 'OS Notes', description: '', subject: { id: 's1', name: 'Operating Systems' }, semester: null, fileType: 'pdf', fileSize: 2048,
  pageCount: 4, width: null, height: null, processingStatus: 'ready', publicationStatus: 'draft' };
let routes;
beforeEach(() => {
  routes = {
    'GET /api/auth/me': () => json(200, { user: ADMIN, csrfToken: 'csrf1' }),
    'GET /api/admin/subjects': () => json(200, { items: [{ id: 's1', name: 'Operating Systems', slug: 'os', description: '' }] }),
    'GET /api/admin/documents?page=1&limit=10': () => json(200, { items: [DOC], page: 1, limit: 10, total: 1, pages: 1 }),
  };
  globalThis.fetch = vi.fn((url, o = {}) => { const h = routes[`${o.method ?? 'GET'} ${url}`]; return h ? h(o) : json(404, { error: { message: 'nf' } }); });
});
const at = (p) => render(<ThemeProvider><MemoryRouter initialEntries={[p]}><AuthProvider><App /></AuthProvider></MemoryRouter></ThemeProvider>);

describe('admin documents', () => {
  it('lists documents with text status badges and shows real stats on the dashboard', async () => {
    routes['GET /api/admin/stats'] = () => json(200, { total: 7, published: 3, drafts: 4, inProgress: 0, failed: 0, pdf: 5, image: 2, totalBytes: 2048 });
    at('/admin');
    expect(await screen.findByText('Total documents')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
  it('shows an error state with retry when stats fail', async () => {
    routes['GET /api/admin/stats'] = () => json(500, { error: { message: 'Something went wrong.' } });
    at('/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
  it('publishes a draft with the CSRF header', async () => {
    routes['PATCH /api/admin/documents/d1/publish'] = () => json(200, { ...DOC, publicationStatus: 'published' });
    at('/admin/documents');
    expect(await screen.findByRole('rowheader', { name: /os notes/i })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Draft')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /publish os notes/i }));
    const call = fetch.mock.calls.find(([u]) => u === '/api/admin/documents/d1/publish');
    expect(JSON.parse(call[1].body)).toEqual({ published: true });
    expect(call[1].headers['X-CSRF-Token']).toBe('csrf1');
    expect(await screen.findByText(/“OS Notes” published/)).toBeInTheDocument();
  });
  it('requires confirmation before deleting, and Escape cancels without deleting', async () => {
    routes['DELETE /api/admin/documents/d1'] = () => json(204, null);
    at('/admin/documents');
    await userEvent.click(await screen.findByRole('button', { name: /delete os notes/i }));
    const dlg = await screen.findByRole('dialog', { name: /delete this document/i });
    expect(within(dlg).getByRole('button', { name: /cancel/i })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /delete os notes/i }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /delete permanently/i }));
    expect(fetch.mock.calls.some(([u, o]) => u === '/api/admin/documents/d1' && o?.method === 'DELETE')).toBe(true);
  });
  it('shows an empty state when there are no documents', async () => {
    routes['GET /api/admin/documents?page=1&limit=10'] = () => json(200, { items: [], page: 1, limit: 10, total: 0, pages: 1 });
    at('/admin/documents');
    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
  });
});

describe('admin upload', () => {
  it('rejects unsupported files client-side and requires required fields', async () => {
    at('/admin/upload');
    const input = await screen.findByLabelText('Title');
    expect(input).toBeInTheDocument();
    await userEvent.upload(document.getElementById('file-input'), new File(['x'], 'virus.exe', { type: 'application/octet-stream' }), { applyAccept: false });
    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(await screen.findByText(/choose a subject/i)).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => u === '/api/admin/documents')).toBe(false);
  });
  it('shows the file name and size after choosing a valid file', async () => {
    at('/admin/upload');
    await screen.findByLabelText('Title');
    await userEvent.upload(document.getElementById('file-input'), new File([new Uint8Array(2048)], 'unit1.pdf', { type: 'application/pdf' }));
    expect(screen.getByTestId('file-summary')).toHaveTextContent('unit1.pdf · 2 KB');
    expect(screen.getByLabelText('Title')).toHaveValue('unit1');
  });
});
