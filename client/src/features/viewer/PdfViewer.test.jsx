import { render, screen, fireEvent, createEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./pdfjs.js', () => ({ openPdf: vi.fn(), isRenderCancelled: (e) => e?.name === 'RenderingCancelledException' }));
vi.mock('../../api/client.js', async (orig) => ({ ...(await orig()), notifyUnauthorized: vi.fn() }));
const { openPdf } = await import('./pdfjs.js');
const { notifyUnauthorized } = await import('../../api/client.js');
const { default: PdfViewer } = await import('./PdfViewer.jsx');

const IDENTITY = 's*****t@example.edu · 2026-01-05 09:07';
let renders; let destroy;
const makePdf = (n) => ({ numPages: n, getPage: vi.fn(async (p) => ({
  getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
  render: vi.fn(() => { const task = { promise: Promise.resolve(), cancel: vi.fn() }; renders.push({ p, task }); return task; }),
  cleanup: vi.fn(),
})) });
const load = (n = 5) => { const pdf = makePdf(n); destroy = vi.fn(); openPdf.mockResolvedValue({ promise: Promise.resolve(pdf), destroy }); return pdf; };
const show = (...nums) => globalThis.__setVisible((el) => nums.includes(Number(el.dataset.page)));
const mount = (props = {}) => render(<PdfViewer docId="d1" title="OS Notes" identity={IDENTITY} size={123456} {...props} />);
const ready = () => screen.findByRole('toolbar', { name: /document controls/i });

beforeEach(() => { renders = []; openPdf.mockReset(); notifyUnauthorized.mockReset(); globalThis.__viewport = { width: 800, height: 600 }; });

describe('PdfViewer', () => {
  it('shows loading, opens through the authorized range loader with the known length, and has no download/print controls', async () => {
    load(5); mount();
    expect(screen.getByRole('status')).toHaveTextContent(/loading document/i);
    await ready();
    expect(openPdf).toHaveBeenCalledWith('/api/documents/d1/content', expect.objectContaining({ length: 123456 }));
    expect(screen.getByText('of 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download|print|save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /download|print/i })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /reader: os notes/i })).toBeInTheDocument();
  });
  it('renders pages lazily: only pages near the viewport are drawn, even for a long document', async () => {
    const pdf = load(200); mount(); await ready();
    expect(document.querySelectorAll('.pdf-page')).toHaveLength(200);   // placeholders keep the scroll height
    expect(renders).toHaveLength(0);
    await show(1, 2);
    await waitFor(() => expect(renders.map((r) => r.p).sort()).toEqual([1, 2]));
    expect(pdf.getPage.mock.calls.map(([p]) => p).filter((p) => p > 2)).toEqual([]);
  });
  it('anchors every loading label to its own page, including page 33', async () => {
    load(40); mount(); await ready();
    const page1 = document.querySelector('[data-page="1"]');
    const page33 = document.querySelector('[data-page="33"]');
    expect(page1.style.position).toBe('relative');
    expect(page33.style.position).toBe('relative');
    expect(within(page1).getByText('Loading page 1…')).toBeInTheDocument();
    expect(within(page33).getByText('Loading page 33…')).toBeInTheDocument();
  });
  it('releases and cancels pages that scroll far away, and cancels obsolete renders when zoom changes', async () => {
    load(5); mount(); await ready(); await show(1);
    await waitFor(() => expect(renders).toHaveLength(1));
    const canvas = document.querySelector('[data-page="1"] canvas');
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await waitFor(() => expect(renders.length).toBeGreaterThan(1));
    expect(renders[0].task.cancel).toHaveBeenCalled();                  // render for the old scale was cancelled
    await globalThis.__setVisible((el) => el.dataset.page === '1', false);
    await waitFor(() => expect(canvas.width).toBe(0));                  // canvas memory released when far away
  });
  it('supports fit-to-width, fit-to-page and preset zoom steps with limits', async () => {
    load(3); mount(); await ready();
    const zoom = () => screen.getByLabelText('Zoom level');
    await waitFor(() => expect(zoom()).toHaveTextContent('128%'));      // (800-32)/600
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));  expect(zoom()).toHaveTextContent('150%');
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' })); expect(zoom()).toHaveTextContent('125%');
    await userEvent.click(screen.getByRole('button', { name: 'Fit to page' })); expect(zoom()).toHaveTextContent('71%');   // height-bound: (600-32)/800
    expect(screen.getByRole('button', { name: 'Fit to page' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Fit to width' })); expect(zoom()).toHaveTextContent('128%');
    for (let i = 0; i < 12; i++) await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(zoom()).toHaveTextContent('400%'); expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });
  it('minimizes to a floating state and restores without losing PDF controls or page state', async () => {
    load(5); mount(); await ready();
    const viewer = screen.getByRole('region', { name: 'Reader: OS Notes' });
    expect(viewer).toHaveClass('viewer--fullscreen');

    await userEvent.click(screen.getByRole('button', { name: 'Minimize PDF viewer' }));
    expect(viewer).toHaveClass('viewer--minimized');
    expect(viewer).not.toHaveClass('viewer--fullscreen');
    expect(screen.getByRole('button', { name: 'Restore PDF viewer' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByLabelText('Page number')).toHaveValue('2');

    await userEvent.click(screen.getByRole('button', { name: 'Restore PDF viewer' }));
    expect(viewer).toHaveClass('viewer--fullscreen');
    expect(viewer).not.toHaveClass('viewer--minimized');
    expect(screen.getByLabelText('Page number')).toHaveValue('2');
  });
  it('adapts fit-to-width to small screens', async () => {
    globalThis.__viewport = { width: 320, height: 500 }; load(2); mount(); await ready();
    await waitFor(() => expect(screen.getByLabelText('Zoom level')).toHaveTextContent('48%')); // (320-32)/600
    expect(document.querySelector('.pdf-page').style.width).toBe('288px');
  });
  it('navigates pages with buttons and the page field, clamping out-of-range input', async () => {
    load(5); mount(); await ready();
    const input = screen.getByLabelText('Page number');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(input).toHaveValue('2');
    await userEvent.clear(input); await userEvent.type(input, '4{Enter}'); expect(input).toHaveValue('4');
    await userEvent.clear(input); await userEvent.type(input, '99{Enter}'); expect(input).toHaveValue('5');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
  it('supports keyboard zoom shortcuts on the focusable reader', async () => {
    load(2); mount(); await ready();
    const sc = screen.getByLabelText(/document pages/i); expect(sc).toHaveAttribute('tabindex', '0');
    await waitFor(() => expect(screen.getByLabelText('Zoom level')).toHaveTextContent('128%'));
    fireEvent.keyDown(sc, { key: '+' }); expect(screen.getByLabelText('Zoom level')).toHaveTextContent('150%');
    fireEvent.keyDown(sc, { key: '-' }); fireEvent.keyDown(sc, { key: '0' }); expect(screen.getByLabelText('Zoom level')).toHaveTextContent('128%');
  });
  it('overlays the watermark on every page placeholder, using the identity it was given', async () => {
    load(4); mount(); await ready();
    const marks = screen.getAllByTestId('watermark');
    expect(marks).toHaveLength(4);
    for (const m of marks) expect(m).toHaveTextContent(IDENTITY);
    expect(document.querySelector('.watermark').getAttribute('aria-hidden')).toBe('true');
  });
  it('blocks the context menu (a casual-copying deterrent only)', async () => {
    load(2); mount(); await ready();
    const sc = screen.getByLabelText(/document pages/i); const ev = createEvent.contextMenu(sc); fireEvent(sc, ev);
    expect(ev.defaultPrevented).toBe(true);
  });
  it.each([[404, /no longer available/i, false], [500, /could not be loaded/i, true], [401, /session has expired/i, true]])('shows a clear error for HTTP %i', async (status, msg, retry) => {
    openPdf.mockRejectedValue(Object.assign(new Error('x'), { status })); mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(msg);
    expect(!!screen.queryByRole('button', { name: /try again/i })).toBe(retry);
    expect(notifyUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
  it('retry reloads the document', async () => {
    load(3); openPdf.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 500 })); // first call fails, the retry succeeds
    mount();
    await userEvent.click(await screen.findByRole('button', { name: /try again/i }));
    await ready(); expect(openPdf).toHaveBeenCalledTimes(2);
  });
  it('turns a later range failure (session ended / unpublished) into an error state and destroys the task', async () => {
    load(5); mount(); await ready();
    const { onError } = openPdf.mock.calls[0][1];
    await waitFor(() => expect(destroy).not.toHaveBeenCalled());
    await act_(() => onError(Object.assign(new Error('x'), { status: 404 })));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/i);
    expect(destroy).toHaveBeenCalled();
  });
  it('destroys the loading task on unmount', async () => {
    load(2); const { unmount } = mount(); await ready(); unmount(); expect(destroy).toHaveBeenCalled();
  });
});
function act_(fn) { return import('@testing-library/react').then(({ act }) => act(fn)); }
