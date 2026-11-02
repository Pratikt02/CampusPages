import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { HeroIllustration } from '../components/HeroIllustration.jsx';
import { BookOpen, ShieldCheck, Smartphone, Mail, Lock, User, AlertCircle } from 'lucide-react';
import { useAuth, homeFor } from '../features/auth/AuthProvider.jsx';
import { canAccess, safeDestination } from '../routes/guards.jsx';
import { api, setCsrfToken } from '../api/client.js';

export default function RegisterPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = safeDestination(useLocation().state?.from);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const dest = (u) => (from && canAccess(u, from) ? from : homeFor(u));
  if (user) return <Navigate to={dest(user)} replace />;

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
      setError('All fields are required.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true); setError('');
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: { name: form.name, email: form.email, password: form.password, confirmPassword: form.confirmPassword }
      });
      setCsrfToken(data.csrfToken);
      navigate(dest(data.user), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const checkStrength = (val) => {
    let score = 0;
    if (val.length >= 8) score += 1;
    if (/[A-Z]/.test(val)) score += 1;
    if (/[0-9]/.test(val)) score += 1;
    if (/[^A-Za-z0-9]/.test(val)) score += 1;
    if (val.length >= 12) score += 1;
    setPasswordStrength(score);
  };

  return (
    <main id="main" className="auth-page register-page">
      <div className="register-bg">
        <div className="register-glow register-glow-1" />
        <div className="register-glow register-glow-2" />
        <div className="register-glow register-glow-3" />
      </div>
      <div className="auth-shell auth-shell-wide">
        <div className="auth-panel card register-panel">
          <div className="register-header">
            <BrandLogo showSlogan />
            <div className="register-accent" />
            <h1>Create your student account</h1>
            <p className="register-subtitle">Join CampusPages and start building your academic library today.</p>
          </div>
          <form onSubmit={submit} noValidate>
            <label className="field register-field"><span>Full Name</span>
              <div className="field-input-wrap">
                <User size={18} aria-hidden="true" />
                <input type="text" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!error} />
              </div>
            </label>
            <label className="field register-field"><span>Email</span>
              <div className="field-input-wrap">
                <Mail size={18} aria-hidden="true" />
                <input type="email" autoComplete="username" value={form.email} onChange={set('email')} aria-invalid={!!error} />
              </div>
            </label>
            <label className="field register-field"><span>Password</span>
              <div className="field-input-wrap">
                <Lock size={18} aria-hidden="true" />
                <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => { set('password')(e); checkStrength(e.target.value); }} aria-invalid={!!error} />
              </div>
              {passwordStrength > 0 && (
                <div className="strength-meter">
                  <div className="strength-bar">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className={`strength-segment ${i < passwordStrength ? 'strength-active' : ''}`} />
                    ))}
                  </div>
                  <span className="strength-label">{passwordStrength === 0 ? '' : passwordStrength < 2 ? 'Weak' : passwordStrength < 4 ? 'Fair' : 'Strong'}</span>
                </div>
              )}
            </label>
            <label className="field register-field"><span>Confirm Password</span>
              <div className="field-input-wrap">
                <Lock size={18} aria-hidden="true" />
                <input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} aria-invalid={!!error} />
              </div>
            </label>
            {error && <p role="alert" className="error register-error"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
            <button className="btn btn-primary auth-submit register-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create Account'}</button>
          </form>
          <p className="auth-footnote register-footnote">Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
        <aside className="auth-side auth-side-featured">
          <div className="auth-side-card register-side-card">
            <span className="eyebrow register-eyebrow">Join CampusPages</span>
            <h2>Access your academic reading room</h2>
            <div className="auth-reading-art register-reading-art">
              <HeroIllustration />
            </div>
            <ul className="benefit-list">
              <li className="benefit-item">
                <span className="benefit-icon" aria-hidden="true"><BookOpen size={20} strokeWidth={2.25} /></span>
                <span className="benefit-text">Organized study notes by subject</span>
              </li>
              <li className="benefit-item">
                <span className="benefit-icon" aria-hidden="true"><ShieldCheck size={20} strokeWidth={2.25} /></span>
                <span className="benefit-text">Protected PDFs and image resources</span>
              </li>
              <li className="benefit-item">
                <span className="benefit-icon" aria-hidden="true"><Smartphone size={20} strokeWidth={2.25} /></span>
                <span className="benefit-text">Seamless reading across devices</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
