import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCsrfToken, setUnauthorizedHandler } from '../../api/client.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : '/app');

export function AuthProvider({ children }) {
  // status: 'loading' | 'authenticated' | 'anonymous'. The public homepage never waits on this.
  const [state, setState] = useState({ status: 'loading', user: null, expired: false });

  useEffect(() => {
    setUnauthorizedHandler(() => { setCsrfToken(null); setState({ status: 'anonymous', user: null, expired: true }); });
    const ctl = new AbortController();
    api('/auth/me', { signal: ctl.signal })
      .then((d) => { setCsrfToken(d.csrfToken); setState({ status: 'authenticated', user: d.user, expired: false }); })
      .catch((e) => { if (e.name !== 'AbortError') setState({ status: 'anonymous', user: null, expired: false }); });
    return () => ctl.abort();
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    setCsrfToken(d.csrfToken);
    setState({ status: 'authenticated', user: d.user, expired: false });
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* session may already be gone */ }
    setCsrfToken(null);
    setState({ status: 'anonymous', user: null, expired: false });
  }, []);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
