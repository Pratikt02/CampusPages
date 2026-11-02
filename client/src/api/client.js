// Centralized API client: cookies via credentials, CSRF header on unsafe methods, uniform errors.
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
let csrfToken = null;
let onUnauthorized = () => {};
export const setCsrfToken = (t) => { csrfToken = t; };
export const getCsrfToken = () => csrfToken;
export const notifyUnauthorized = () => onUnauthorized();
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, credentials: 'include', signal,
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error ?? {};
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') onUnauthorized();
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Request failed.');
  }
  return data;
}
