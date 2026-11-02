import { render, screen, fireEvent, createEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider } from '../../components/ThemeProvider.jsx';
import { AuthProvider } from '../auth/AuthProvider.jsx';

vi.mock('./pdfjs.js', () => ({ openPdf: vi.fn(), isRenderCancelled: () => false }));
vi.mock('../../api/client.js', async (orig) => ({ ...(await orig()), notifyUnauthorized: vi.fn() }));
const { openPdf } = await import('./pdfjs.js');
const { notifyUnauthorized } = await import('../../api/client.js');
const { default: App } = await import('../../App.jsx');
const { default: ImageViewer } = await import('./ImageViewer.jsx');

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const STUDENT = { id: '1', name: 'Sam', email: 'student@example.edu', role: 'student' };
const META = { id: 'd1', title: 'OS Notes', description: '', subject: { id: 's', name: 'OS' }, semester: null, fileType: 'pdf', pageCount: 3, width: null, height: null, fileSize: 5000, createdAt: '2026-01-01T00:00:00Z' };
let routes; let content;
beforeEach(() => {
  openPdf.mockReset(); notifyUnauthorized.mockReset(); globalThis.__viewport = { width: 800, height: 600 };
  content = vi.fn();
  routes = { 'GET /api/auth/me': () => json(200, { user: STUDENT, csrfToken: 't' }), 'GET /api/documents/d1': () => json(200, META) };
  globalThis.fetch = vi.fn((url, o = {}) => {
    if (url === '/api/documents/d1/content') return content(url, o);
    const h = routes[`${o.method ?? 'GET'} ${url.split('?')[0]}`]; return h ? h(o) : json(404, { error: { message: 'nf' } });
  });
});
const imgResponse = (type = 'image/png', status = 200) => Promise.resolve(status === 200 ? new Response('x', { status, headers: { 'Content-Type': type } }) : new Response('', { status }));
const at = (path) => render(<ThemeProvider><MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter></ThemeProvider>);
const loadImage = async (w = 2000, h = 1000) => {
  // Hidden (and therefore nameless) until it has loaded: find it by role only, load it, then it becomes a named, visible image.
  const hidden = await screen.findByRole('img', { hidden: true });
  Object.defineProperty(hidden, 'naturalWidth', { value: w, configurable: true }); Object.defineProperty(hidden, 'naturalHeight', { value: h, configurable: true });
  fireEvent.load(hidden);
  return screen.findByRole('img', { name: 'OS Notes' });
};
const zoom = () => screen.getByLabelText('Zoom level');
const IDENT = 'u*****t@example.edu · 2026-01-05 09:07';

describe('ImageViewer', () => {
  const mountImage = () => render(<ImageViewer docId="d1" title="OS Notes" identity={IDENT} />);

  it('fetches with the session cookie, shows the image from an in-memory object URL, watermarks it, and revokes the URL on unmount', async () => {
    content.mockImplementation(() => imgResponse());
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:abc'); const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { unmount } = mountImage();
    const img = await loadImage();
    expect(content.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
    expect(img).toHaveAttribute('src', 'blob:abc'); expect(create).toHaveBeenCalled();
    expect(img).toHaveAttribute('draggable', 'false');
    expect(screen.getByTestId('watermark')).toHaveTextContent(IDENT);
    expect(screen.queryByRole('button', { name: /download|print|save/i })).not.toBeInTheDocument();
    unmount(); expect(revoke).toHaveBeenCalledWith('blob:abc');
  });
  it('fits to view, then zooms in/out, shows actual size, and refits', async () => {
    content.mockImplementation(() => imgResponse()); mountImage(); await loadImage(2000, 1000);
    await waitFor(() => expect(zoom()).toHaveTextContent('39%'));      // min((800-16)/2000 = 0.392, (600-16)/1000)
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' })); expect(zoom()).toHaveTextContent('50%');
    await userEvent.click(screen.getByRole('button', { name: 'Actual size' })); expect(zoom()).toHaveTextContent('100%');
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' })); expect(zoom()).toHaveTextContent('75%');
    await userEvent.click(screen.getByRole('button', { name: 'Fit to view' })); expect(zoom()).toHaveTextContent('39%');
    expect(screen.getByRole('button', { name: 'Fit to view' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('never upscales small images when fitting', async () => {
    content.mockImplementation(() => imgResponse()); mountImage(); await loadImage(200, 100);
    await waitFor(() => expect(zoom()).toHaveTextContent('100%'));
  });
  it('supports keyboard zoom, pan and fit', async () => {
    content.mockImplementation(() => imgResponse()); mountImage(); const img = await loadImage(2000, 1000);
    const stage = screen.getByLabelText(/drag to pan/i); expect(stage).toHaveAttribute('tabindex', '0');
    await waitFor(() => expect(zoom()).toHaveTextContent('39%'));
    fireEvent.keyDown(stage, { key: '+' }); expect(zoom()).toHaveTextContent('50%');
    fireEvent.keyDown(stage, { key: 'ArrowLeft' }); expect(img.style.transform).toContain('48px');
    fireEvent.keyDown(stage, { key: '0' }); expect(zoom()).toHaveTextContent('39%'); expect(img.style.transform).toContain('+ 0px');
  });
  it('pans by dragging when zoomed in, and keeps the image within bounds', async () => {
    content.mockImplementation(() => imgResponse()); mountImage(); const img = await loadImage(2000, 1000);
    await userEvent.click(screen.getByRole('button', { name: 'Actual size' }));
    const stage = screen.getByLabelText(/drag to pan/i);
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 160, clientY: 120 });
    expect(img.style.transform).toContain('+ 60px'); expect(img.style.transform).toContain('+ 20px');
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 99999, clientY: 120 });   // huge drag is clamped: (2000-800)/2 = 600
    expect(img.style.transform).toContain('+ 600px');
    fireEvent.pointerUp(stage, { pointerId: 1 });
  });
  it('blocks the context menu (deterrent only)', async () => {
    content.mockImplementation(() => imgResponse()); mountImage(); await loadImage();
    const stage = screen.getByLabelText(/drag to pan/i); const ev = createEvent.contextMenu(stage); fireEvent(stage, ev); expect(ev.defaultPrevented).toBe(true);
  });
  it.each([[404, /no longer available/i, false], [500, /could not be loaded/i, true], [401, /session has expired/i, true]])('shows a clear error for HTTP %i', async (status, msg, retry) => {
    content.mockImplementation(() => imgResponse('image/png', status)); mountImage();
    expect(await screen.findByRole('alert')).toHaveTextContent(msg);
    expect(!!screen.queryByRole('button', { name: /try again/i })).toBe(retry);
    expect(notifyUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
  it('rejects a response that is not an image, and retry works', async () => {
    content.mockImplementationOnce(() => imgResponse('text/html')); content.mockImplementation(() => imgResponse());
    mountImage();
    await userEvent.click(await screen.findByRole('button', { name: /try again/i }));
    await loadImage(); expect(content).toHaveBeenCalledTimes(2);
  });
});

describe('ViewerPage', () => {
  const fakePdf = () => { const pdf = { numPages: 3, getPage: vi.fn(async () => ({ getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel() {} }), cleanup() {} })) };
    openPdf.mockResolvedValue({ promise: Promise.resolve(pdf), destroy: vi.fn() }); };

  it('opens a PDF in the PDF reader with the document title, a back link, and a session-derived masked watermark', async () => {
    fakePdf(); at('/app/documents/d1');
    expect(await screen.findByRole('toolbar', { name: /document controls/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'OS Notes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to library' })).toHaveAttribute('href', '/app');
    expect(openPdf).toHaveBeenCalledWith('/api/documents/d1/content', expect.objectContaining({ length: 5000 }));
    expect(screen.getAllByTestId('watermark')[0]).toHaveTextContent(/^s\*{5}t@example\.edu · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(screen.queryByRole('button', { name: /download|print/i })).not.toBeInTheDocument();
  });
  it('ignores identity-looking query parameters: the watermark always comes from the authenticated session', async () => {
    fakePdf(); at('/app/documents/d1?watermark=attacker@evil.com&user=admin@example.edu&email=boss@x.org');
    await screen.findByRole('toolbar');
    const text = screen.getAllByTestId('watermark').map((n) => n.textContent).join(' ');
    expect(text).toContain('s*****t@example.edu'); expect(text).not.toMatch(/attacker|evil|boss|admin/);
  });
  it('opens images in the image reader', async () => {
    routes['GET /api/documents/d1'] = () => json(200, { ...META, fileType: 'image', pageCount: null, width: 2000, height: 1000 });
    content.mockImplementation(() => imgResponse()); at('/app/documents/d1');
    await loadImage(); expect(openPdf).not.toHaveBeenCalled(); expect(screen.getByRole('toolbar', { name: /image controls/i })).toBeInTheDocument();
  });
  it('shows a friendly message for a document that is unavailable (404) and a retry for server errors', async () => {
    routes['GET /api/documents/d1'] = () => json(404, { error: { code: 'NOT_FOUND', message: 'Document not found.' } });
    at('/app/documents/d1');
    expect(await screen.findByRole('heading', { name: /document not available/i })).toBeInTheDocument();
  });
  it('shows a retry for metadata server errors', async () => {
    routes['GET /api/documents/d1'] = () => json(500, { error: { message: 'Something went wrong.' } });
    at('/app/documents/d1');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
  it('requires sign-in: guests are redirected to login', async () => {
    routes['GET /api/auth/me'] = () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });
    at('/app/documents/d1');
    expect(await screen.findByRole('heading', { name: /student login/i })).toBeInTheDocument();
    expect(openPdf).not.toHaveBeenCalled(); expect(content).not.toHaveBeenCalled();
  });
});
