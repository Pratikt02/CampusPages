import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { useAuth, homeFor } from '../features/auth/AuthProvider.jsx';
import { canAccess, safeDestination } from '../routes/guards.jsx';

export default function LoginPage() {
  const { user, login, expired } = useAuth();
  const navigate = useNavigate();
  const from = safeDestination(useLocation().state?.from);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const dest = (u) => (from && canAccess(u, from) ? from : homeFor(u));
  if (user) return <Navigate to={dest(user)} replace />;

  async function submit(e) {
    e.preventDefault();
    if (!form.email.trim() || !form.password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError('');
    try { navigate(dest(await login(form.email.trim(), form.password)), { replace: true }); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <main id="main" className="auth-page container login-page">
      <div className="auth-shell">
        <div className="auth-panel card">
          <BrandLogo showSlogan />
          <h1>Student login</h1>
          {expired && <p role="status" className="notice">Your session expired. Please sign in again.</p>}
          <form onSubmit={submit} noValidate>
            <label className="field"><span>Email</span>
              <input type="email" autoComplete="username" value={form.email} onChange={set('email')}
                aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} /></label>
            <label className="field"><span>Password</span>
              <input type="password" autoComplete="current-password" value={form.password} onChange={set('password')}
                aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} /></label>
            {error && <p id="login-error" role="alert" className="error">{error}</p>}
            <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="auth-meta">
            <Link to="/">Back to home</Link>
            <Link to="/register">Create account</Link>
          </p>
        </div>
        <aside className="auth-side login-side">
          <div className="login-story-card">
            <div className="login-photo-wrap">
              <img
                className="login-photo"
                src="https://images.unsplash.com/photo-1741699427706-7bfb38c716d8?auto=format&fit=crop&w=1400&q=85"
                alt="A student studying among the tall shelves of a university library"
                fetchPriority="high"
              />
              <span className="login-photo-label">A calmer place to study</span>
            </div>
            <div className="login-story-copy">
              <span className="eyebrow">Your campus reading room</span>
              <h2>Make space for focused learning.</h2>
              <p>Find your course materials, settle in, and pick up right where your next study session begins.</p>
              <div className="login-benefits" aria-label="CampusPages features">
                <span>Organized by subject</span>
                <span>Read in your browser</span>
                <span>Built for student life</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
