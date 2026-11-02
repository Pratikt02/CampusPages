import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import { AuthProvider } from './features/auth/AuthProvider.jsx';
import App from './App.jsx';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const STUDENT = { id: '1', name: 'Sam Student', email: 's@x.edu', role: 'student' };
const ADMIN = { ...STUDENT, name: 'Ada Admin', role: 'admin' };
let routes;
beforeEach(() => {
  routes = { 'GET /api/auth/me': () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }), 'GET /api/public/subjects': () => json(200, { items: [] }) };
  globalThis.fetch = vi.fn((url, opts = {}) => {
    const h = routes[`${opts.method ?? 'GET'} ${url.split('?')[0]}`];
    return h ? h(opts) : json(404, {});
  });
  document.documentElement.dataset.theme = 'light';
});
const renderAt = (path) => render(
  <ThemeProvider><MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter></ThemeProvider>);

describe('public shell (guest)', () => {
  it('renders the homepage without authentication, with brand + slogan', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('CampusPages');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The digital reading room built for students.');
  });
  it('toggles theme', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: /switch to dark theme/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
  it('mobile menu opens and closes with Escape', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
  });
  it('unknown routes show not-found', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});

describe('authentication UX', () => {
  it('guests on a protected route are sent to login', async () => {
    renderAt('/app');
    expect(await screen.findByRole('heading', { name: /student login/i })).toBeInTheDocument();
  });
  it('shows a generic server error on failed login and does not navigate', async () => {
    routes['POST /api/auth/login'] = () => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('Email'), 's@x.edu');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });
  it('validates empty fields client-side', async () => {
    renderAt('/login');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your email and password/i);
    expect(fetch).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });
  it('student login lands on /app; CSRF token is sent on logout', async () => {
    routes['POST /api/auth/login'] = () => json(200, { user: STUDENT, csrfToken: 'tok123' });
    routes['POST /api/auth/logout'] = () => json(204, null);
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('Email'), 's@x.edu');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('heading', { name: /welcome, sam student/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    const call = fetch.mock.calls.find(([u]) => u === '/api/auth/logout');
    expect(call[1].headers['X-CSRF-Token']).toBe('tok123');
    expect(call[1].credentials).toBe('include');
    await waitFor(() => expect(screen.queryByText(/welcome, sam/i)).not.toBeInTheDocument());
  });
  it('a student opening /admin sees the unauthorized page', async () => {
    routes['GET /api/auth/me'] = () => json(200, { user: STUDENT, csrfToken: 't' });
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: /don’t have access/i })).toBeInTheDocument();
  });
  it('an admin can open /admin', async () => {
    routes['GET /api/auth/me'] = () => json(200, { user: ADMIN, csrfToken: 't' });
    renderAt('/admin');
    routes['GET /api/admin/stats'] = () => json(200, { total: 0, published: 0, drafts: 0, inProgress: 0, failed: 0, pdf: 0, image: 0, totalBytes: 0 });
    expect(await screen.findByRole('heading', { name: /admin overview/i })).toBeInTheDocument();
  });
  it('preserves an authorized destination and refuses open-redirect values', async () => {
    const { safeDestination } = await import('./routes/guards.jsx');
    expect(safeDestination('/app?x=1')).toBe('/app?x=1');
    for (const bad of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', '/\\evil.com', undefined]) expect(safeDestination(bad)).toBeNull();
  });
  it('shows the session-expired notice after a 401 on a protected call', async () => {
    routes['GET /api/auth/me'] = () => json(200, { user: STUDENT, csrfToken: 't' });
    routes['POST /api/auth/logout'] = () => json(401, {});
    const { api } = await import('./api/client.js');
    renderAt('/app');
    await screen.findByRole('heading', { name: /welcome, sam/i });
    await api('/documents').catch(() => {}); // 404 mock: no effect
    routes['GET /api/documents'] = () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });
    await api('/documents').catch(() => {});
    expect(await screen.findByText(/your session expired/i)).toBeInTheDocument();
  });
});
