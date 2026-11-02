import { api } from './client.js';
export const docsApi = {
  list: (params, signal) => api(`/documents?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`, { signal }),
  facets: (signal) => api('/documents/facets', { signal }),
  get: (id, signal) => api(`/documents/${encodeURIComponent(id)}`, { signal }),
};
