import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider.jsx';

// UX only. The backend enforces every real access rule.
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <div className="centered" role="status">Checking your session…</div>;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

export function RoleGuard({ role }) {
  const { user } = useAuth();
  return user?.role === role ? <Outlet /> : <Navigate to="/unauthorized" replace />;
}

// Only same-origin relative paths are honored; prevents open redirects.
export const safeDestination = (from) =>
  typeof from === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(from) ? from : null;

export const canAccess = (user, path) => !(path.startsWith('/admin') && user.role !== 'admin');
