import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';

export function useAnnotations(docId, enabled) {
  const [state, setState] = useState({ pages: {}, status: 'loading' });
  const queues = useRef(new Map());
  const revisions = useRef(new Map());
  const activeDoc = useRef(docId);
  activeDoc.current = docId;

  useEffect(() => {
    if (!enabled || !docId) {
      setState({ pages: {}, status: 'loading' });
      return undefined;
    }
    const controller = new AbortController();
    setState({ pages: {}, status: 'loading' });
    queues.current.clear();
    revisions.current.clear();
    api(`/documents/${encodeURIComponent(docId)}/annotations`, { signal: controller.signal })
      .then(({ items }) => {
        const pages = Object.fromEntries(items.map(({ page, strokes }) => [page, strokes]));
        setState({ pages, status: 'ready' });
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') setState({ pages: {}, status: 'error' });
      });
    return () => controller.abort();
  }, [docId, enabled]);

  const savePage = useCallback((page, strokes) => {
    setState((current) => ({ ...current, pages: { ...current.pages, [page]: strokes }, status: 'saving' }));
    const revision = (revisions.current.get(page) ?? 0) + 1;
    revisions.current.set(page, revision);
    const previous = queues.current.get(page) ?? Promise.resolve();
    const request = previous.catch(() => {}).then(() => api(
      `/documents/${encodeURIComponent(docId)}/annotations/${page}`,
      { method: 'PUT', body: { strokes } },
    ));
    queues.current.set(page, request);
    request.then(() => {
      if (activeDoc.current === docId && revisions.current.get(page) === revision) setState((current) => ({ ...current, status: 'saved' }));
    }).catch(() => {
      if (activeDoc.current === docId && revisions.current.get(page) === revision) setState((current) => ({ ...current, status: 'error' }));
    });
    return request;
  }, [docId]);

  return { ...state, savePage };
}
