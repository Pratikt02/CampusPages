import { api, ApiError, getCsrfToken, notifyUnauthorized } from './client.js';

export const adminApi = {
  stats: (signal) => api('/admin/stats', { signal }),
  subjects: (signal) => api('/admin/subjects', { signal }),
  createSubject: (body) => api('/admin/subjects', { method: 'POST', body }),
  list: (params, signal) => api(`/admin/documents?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`, { signal }),
  update: (id, body) => api(`/admin/documents/${id}`, { method: 'PATCH', body }),
  replaceFile: (id, file, options) => {
    const form = new FormData(); form.append('file', file);
    return uploadDocument(form, { ...options, url: `/api/admin/documents/${encodeURIComponent(id)}/file`, method: 'PUT', expectedStatus: 200 });
  },
  publish: (id, published) => api(`/admin/documents/${id}/publish`, { method: 'PATCH', body: { published } }),
  remove: (id) => api(`/admin/documents/${id}`, { method: 'DELETE' }),
};

// XHR (not fetch) because fetch cannot report upload progress. Resolves only on a confirmed 201 from the server.
export function uploadDocument(formData, { onProgress, onSent, signal, url = '/api/admin/documents', method = 'POST', expectedStatus = 201 } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    if (getCsrfToken()) xhr.setRequestHeader('X-CSRF-Token', getCsrfToken());
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.upload.onload = () => onSent?.();
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.'));
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Upload cancelled.'));
    xhr.onload = () => {
      let data = {}; try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status === expectedStatus) return resolve(data);
      if (xhr.status === 401) notifyUnauthorized();
      reject(new ApiError(xhr.status, data.error?.code ?? 'ERROR', data.error?.message ?? 'Upload failed.'));
    };
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(formData);
  });
}
