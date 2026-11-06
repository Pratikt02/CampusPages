import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { BookOpen, ShieldCheck, Smartphone, Mail, Lock, User, AlertCircle, Eye, EyeOff, Check } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const dest = (u) => (from && canAccess(u, from) ? from : homeFor(u));
  if (user) return <Navigate to={dest(user)} replace />;

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
      setError('All fields are required.');
      return;
    }
    if (form.password.length < 10 || form.password.length > 128) {
      setError('Password must be 10–128 characters.');
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
    if (val.length >= 10) score += 1;
    if (val.length >= 14) score += 1;
    if (/[A-Z]/.test(val)) score += 1;
    if (/[0-9]/.test(val)) score += 1;
    if (/[^A-Za-z0-9]/.test(val)) score += 1;
    setPasswordStrength(Math.min(score, 5));
  };

  return (
    <main id="main" className="auth-page register-page register-modern-page">
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
          <div className="register-progress"><span>STUDENT ACCOUNT</span><span>Secure sign up</span></div>
          <form onSubmit={submit} noValidate>
            <div className="field register-field"><label htmlFor="register-name">Full name</label>
              <div className="field-input-wrap">
                <User size={18} aria-hidden="true" />
                <input id="register-name" type="text" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!error} required maxLength={100} placeholder="e.g. Aditi Sharma" />
              </div>
            </div>
            <div className="field register-field"><label htmlFor="register-email">Email address</label>
              <div className="field-input-wrap">
                <Mail size={18} aria-hidden="true" />
                <input id="register-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={!!error} required maxLength={254} placeholder="you@college.edu" />
              </div>
            </div>
            <div className="field register-field"><label htmlFor="register-password">Create password</label>
              <div className="field-input-wrap">
                <Lock size={18} aria-hidden="true" />
                <input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(e) => { set('password')(e); checkStrength(e.target.value); }} aria-invalid={!!error} aria-describedby={form.password ? 'password-guidance password-strength' : 'password-guidance'} required minLength={10} maxLength={128} placeholder="At least 10 characters" />
                <button className="password-visibility" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
              </div>
              {form.password && (
                <div className="strength-meter">
                  <div className="strength-bar">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className={`strength-segment ${i < passwordStrength ? `strength-active strength-active-${i}` : ''}`} />
                    ))}
                  </div>
                  <span id="password-strength" className="strength-label" aria-live="polite">{form.password.length < 10 ? 'Too short' : passwordStrength < 3 ? 'Fair' : passwordStrength < 5 ? 'Good' : 'Strong'}</span>
                </div>
              )}
              <div className="password-guidance" id="password-guidance">
                <span className={form.password.length >= 10 ? 'met' : ''}><Check size={14} aria-hidden="true" />At least 10 characters</span>
                <span className={/[A-Z]/.test(form.password) && /[0-9]/.test(form.password) ? 'met' : ''}><Check size={14} aria-hidden="true" />Add a number and uppercase letter</span>
              </div>
            </div>
            <div className="field register-field"><label htmlFor="register-confirm-password">Confirm password</label>
              <div className="field-input-wrap">
                <Lock size={18} aria-hidden="true" />
                <input id="register-confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} aria-invalid={!!error} required minLength={10} maxLength={128} placeholder="Enter your password again" />
                <button className="password-visibility" type="button" onClick={() => setShowConfirmPassword((shown) => !shown)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmPassword}>{showConfirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
              </div>
              {form.confirmPassword && <span className={`confirm-hint${form.confirmPassword === form.password ? ' matches' : ''}`} aria-live="polite">{form.confirmPassword === form.password ? 'Passwords match' : 'Passwords do not match yet'}</span>}
            </div>
            {error && <p role="alert" className="error register-error"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
            <button className="btn btn-primary auth-submit register-submit" disabled={busy}>{busy ? 'Creating account…' : <>Create my account <span aria-hidden="true">→</span></>}</button>
          </form>
          <p className="auth-footnote register-footnote">Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
        <aside className="auth-side auth-side-featured register-photo-side">
          <div className="register-story-card">
            <div className="register-photo-wrap">
              <img className="register-photo" src="https://images.unsplash.com/photo-1741699427706-7bfb38c716d8?auto=format&fit=crop&w=1400&q=85" alt="A student studying among the tall shelves of a university library" fetchPriority="high" />
              <span className="register-photo-caption">Your next great study session starts here.</span>
            </div>
            <div className="register-story-copy">
              <span className="eyebrow register-eyebrow">A better way to study</span>
              <h2>Everything you need, in one reading room.</h2>
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
          </div>
        </aside>
      </div>
    </main>
  );
}
