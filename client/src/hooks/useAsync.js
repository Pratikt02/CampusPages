import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data with cancellation, loading/error state, and a reload() for retry.
export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn); fnRef.current = fn;
  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current(ctl.signal)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((e) => { if (e.name !== 'AbortError') setState({ loading: false, error: e, data: null }); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}
