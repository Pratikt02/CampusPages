import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { HeroIllustration } from '../components/HeroIllustration.jsx';
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
    <main id="main" className="auth-page container">
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
        <aside className="auth-side">
          <div className="auth-side-card">
            <span className="eyebrow">CampusPages</span>
            <h2>Study with clarity</h2>
            <div className="auth-reading-art">
              <HeroIllustration />
            </div>
            <ul>
              <li>Focused reading room for academic resources</li>
              <li>Protected PDFs, notes, and image-based materials</li>
              <li>Fast browsing across your enrolled subjects</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
