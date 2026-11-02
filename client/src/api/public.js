import { api } from './client.js';
export const publicApi = {
  subjects: (signal) => api('/public/subjects', { signal }),
  subject: (id, signal) => api(`/public/subjects/${encodeURIComponent(id)}`, { signal }),
};
