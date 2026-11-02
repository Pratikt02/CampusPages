import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider } from '../../components/ThemeProvider.jsx';
import { AuthProvider } from '../auth/AuthProvider.jsx';
import App from '../../App.jsx';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const STUDENT = { id: '1', name: 'Sam Student', email: 's@x.edu', role: 'student' };
const SUBJECT = { id: 'a1b2c3d4e5f60718293a4b5c', name: 'Operating Systems', slug: 'os', description: 'Processes and memory', materialCount: 2 };
const DOC = { id: 'd1', title: 'Scheduling Notes', description: 'CPU scheduling', subject: { id: SUBJECT.id, name: SUBJECT.name }, semester: 3, fileType: 'pdf', pageCount: 12, width: null, height: null, fileSize: 204800, createdAt: '2026-01-05T00:00:00Z' };
const PAGE = (items, over = {}) => ({ items, page: 1, limit: 12, total: items.length, pages: 1, ...over });
let routes;
const guest = () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });
beforeEach(() => {
  routes = { 'GET /api/auth/me': guest, 'GET /api/public/subjects': () => json(200, { items: [SUBJECT] }) };
  // Routes match on method + path; query strings are ignored for lookup and inspected via fetch.mock.calls.
  globalThis.fetch = vi.fn((url, o = {}) => { const h = routes[`${o.method ?? 'GET'} ${url.split('?')[0]}`]; return h ? h(o) : json(404, { error: { code: 'NOT_FOUND', message: 'Not found.' } }); });
  document.documentElement.dataset.theme = 'light';
});
const at = (p) => render(<ThemeProvider><MemoryRouter initialEntries={[p]}><AuthProvider><App /></AuthProvider></MemoryRouter></ThemeProvider>);
const lastUrl = (prefix) => [...fetch.mock.calls].reverse().map(([u]) => u).find((u) => u.startsWith(prefix));

describe('public subjects and Login Required modal (guest)', () => {
  it('homepage renders without auth and shows only real subject metadata', async () => {
    at('/');
    expect(await screen.findByRole('link', { name: 'Operating Systems' })).toBeInTheDocument();
    expect(screen.getAllByText('2 study materials').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.subject-scroll-group')).toHaveLength(2);
    const repeatedGroup = document.querySelector('.subject-scroll-group[aria-hidden="true"]');
    expect(repeatedGroup).not.toBeNull();
    expect(repeatedGroup).not.toHaveAttribute('inert');
    expect(repeatedGroup.querySelectorAll('.subject-scroll-card[inert]')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('CampusPages');
    expect(screen.getByRole('list', { name: 'CampusPages highlights' }).querySelectorAll('img')).toHaveLength(3);
    const featureImages = document.querySelectorAll('.feature-grid .feature-card-image');
    expect(featureImages).toHaveLength(8);
    expect([...featureImages].every((image) => image.getAttribute('alt') && image.getAttribute('src').startsWith('/images/feature-'))).toBe(true);
  });
  it('keeps duplicated carousel cards hoverable and their notes buttons active', async () => {
    at('/');
    await screen.findByRole('link', { name: 'Operating Systems' });
    const scroller = document.querySelector('.subject-scroller');
    const repeatedCard = document.querySelector('.subject-scroll-group[aria-hidden="true"] .subject-scroll-card');
    expect(repeatedCard).not.toBeNull();
    expect(repeatedCard).not.toHaveAttribute('inert');

    await userEvent.hover(repeatedCard);
    expect(scroller).toHaveClass('is-card-paused');
    await userEvent.click(repeatedCard.querySelector('button[aria-label^="View Notes"]'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  it('Features navigation scrolls to the homepage feature section', async () => {
    at('/');
    const section = document.getElementById('features');
    section.scrollIntoView = vi.fn();
    await userEvent.click(screen.getByRole('link', { name: 'Features' }));
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
  it('shows an honest empty state, and an error state with retry', async () => {
    routes['GET /api/public/subjects'] = () => json(200, { items: [] });
    at('/');
    expect(await screen.findByText(/no subjects are published yet/i)).toBeInTheDocument();
  });
  it('error state offers retry', async () => {
    routes['GET /api/public/subjects'] = () => json(500, { error: { message: 'x' } });
    at('/');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
  it('View Notes opens the modal; the exact message is shown; Cancel closes it and keeps the page', async () => {
    at('/');
    await userEvent.click(await screen.findByRole('button', { name: /view notes/i }));
    const dlg = await screen.findByRole('dialog', { name: 'Login Required' });
    expect(within(dlg).getByText('Sign in to CampusPages to access this study material and start reading your notes.')).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Sign In' })).toHaveFocus();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
  it('Escape closes the modal and returns focus to the trigger', async () => {
    at('/');
    const trigger = await screen.findByRole('button', { name: /view notes/i });
    await userEvent.click(trigger);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
  it('Sign In goes to /login and the intended destination survives login (authorized)', async () => {
    routes['POST /api/auth/login'] = () => json(200, { user: STUDENT, csrfToken: 't' });
    routes['GET /api/documents'] = () => json(200, PAGE([DOC]));
    at('/');
    await userEvent.click(await screen.findByRole('button', { name: /view notes/i }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByRole('heading', { name: /student login/i })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 's@x.edu');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('heading', { name: /welcome, sam student/i })).toBeInTheDocument();
    await waitFor(() => expect(lastUrl('/api/documents')).toContain(`subject=${SUBJECT.id}`)); // destination preserved
  });
  it('subject detail page is public and also gates View Notes', async () => {
    routes[`GET /api/public/subjects/${SUBJECT.id}`] = () => json(200, SUBJECT);
    at(`/subjects/${SUBJECT.id}`);
    expect(await screen.findByRole('heading', { name: 'Operating Systems' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /view notes/i }));
    expect(await screen.findByRole('dialog', { name: 'Login Required' })).toBeInTheDocument();
  });
  it('unknown subject shows a friendly not-found message', async () => {
    at('/subjects/ffffffffffffffffffffffff');
    expect(await screen.findByRole('heading', { name: /subject not found/i })).toBeInTheDocument();
  });
  it('guests opening a protected document route are redirected to login', async () => {
    at('/app/documents/d1');
    expect(await screen.findByRole('heading', { name: /student login/i })).toBeInTheDocument();
  });
  it('signed-in users skip the modal and go straight to the library', async () => {
    routes['GET /api/auth/me'] = () => json(200, { user: STUDENT, csrfToken: 't' });
    routes['GET /api/documents'] = () => json(200, PAGE([DOC]));
    at('/');
    await userEvent.click(await screen.findByRole('button', { name: /view notes/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /welcome, sam student/i })).toBeInTheDocument();
  });
});

describe('student dashboard and catalogue', () => {
  beforeEach(() => { routes['GET /api/auth/me'] = () => json(200, { user: STUDENT, csrfToken: 't' }); });

  it('renders document cards with type indicator text, metadata, and a link to the detail page', async () => {
    routes['GET /api/documents'] = () => json(200, PAGE([DOC]));
    at('/app');
    const link = await screen.findByRole('link', { name: 'Scheduling Notes' });
    expect(link).toHaveAttribute('href', '/app/documents/d1');
    const card = within(screen.getByRole('listitem'));
    expect(card.getByText('PDF')).toBeInTheDocument();
    expect(card.getByText(/12 pages/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download|print/i })).not.toBeInTheDocument();
  });
  it('sends filters to the API and shows an empty-filter state with a working clear action', async () => {
    routes['GET /api/documents'] = (o) => json(200, PAGE([]));
    at('/app');
    await screen.findByText(/no study materials have been published yet/i);
    await userEvent.selectOptions(screen.getByLabelText('File type'), 'image');
    await waitFor(() => expect(lastUrl('/api/documents')).toContain('fileType=image'));
    expect(await screen.findByText(/no study materials match your filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear all filters/i }));
    await waitFor(() => expect(lastUrl('/api/documents')).not.toContain('fileType'));
  });
  it('debounces search into the query', async () => {
    routes['GET /api/documents'] = () => json(200, PAGE([DOC]));
    at('/app');
    await screen.findByRole('link', { name: 'Scheduling Notes' });
    await userEvent.type(screen.getByLabelText('Search titles'), 'sched');
    await waitFor(() => expect(lastUrl('/api/documents')).toContain('q=sched'));
  });
  it('paginates and shows the result count', async () => {
    routes['GET /api/documents'] = () => json(200, PAGE([DOC], { total: 25, pages: 3 }));
    at('/app');
    expect(await screen.findByText('25 results')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(lastUrl('/api/documents')).toContain('page=2'));
  });
  it('shows an error state with retry', async () => {
    routes['GET /api/documents'] = () => json(500, { error: { message: 'Something went wrong.' } });
    at('/app');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    routes['GET /api/documents'] = () => json(200, PAGE([DOC]));
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('link', { name: 'Scheduling Notes' })).toBeInTheDocument();
  });
});
