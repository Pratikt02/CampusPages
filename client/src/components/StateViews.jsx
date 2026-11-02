import { AlertCircle, Inbox } from 'lucide-react';

export const LoadingSkeleton = ({ rows = 3 }) => (
  <div role="status" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}
  </div>
);
export const EmptyState = ({ title, children }) => (
  <div className="empty"><Inbox size={28} aria-hidden="true" /><p><strong>{title}</strong></p>{children && <p className="muted">{children}</p>}</div>
);
export const ErrorState = ({ message, onRetry }) => (
  <div className="empty" role="alert"><AlertCircle size={28} aria-hidden="true" /><p><strong>{message || 'Something went wrong.'}</strong></p>
    {onRetry && <button type="button" className="btn" onClick={onRetry}>Try again</button>}</div>
);
