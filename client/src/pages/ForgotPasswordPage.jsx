import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { useAuth } from '../features/auth/AuthProvider.jsx';
import { api } from '../api/client.js';

export default function ForgotPasswordPage() {
  const { user } = useAuth();
  const [step, setStep] = useState('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function requestReset(e) {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email address.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setMessage(data.message);
      setStep('reset');
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  async function resetPassword(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit reset code.'); return; }
    if (password.length < 10 || password.length > 128) { setError('Password must be 10–128 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const data = await api('/auth/reset-password', {
        method: 'POST',
        body: { email: email.trim(), code, password, confirmPassword },
      });
      setMessage(data.message);
      setStep('done');
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  return (
    <main id="main" className="auth-page login-page">
      <div className="auth-shell">
        <div className="auth-panel card">
          <BrandLogo showSlogan />
          <h1>{step === 'done' ? 'Password updated' : 'Reset your password'}</h1>

          {step === 'request' && (
            <form onSubmit={requestReset} noValidate>
              <p>Enter your account email. We’ll send a 6-digit reset code if an active account is found.</p>
              <label className="field"><span>Email</span>
                <input type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
              </label>
              {error && <p role="alert" className="error">{error}</p>}
              {message && <p role="status" className="notice">{message}</p>}
              <button className="btn btn-primary auth-submit" disabled={busy}>
                {busy ? 'Sending code…' : 'Send reset code'}
              </button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={resetPassword} noValidate>
              <p className="notice">{message}</p>
              <label className="field"><span>6-digit code</span>
                <input type="text" inputMode="numeric" autoComplete="one-time-code"
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6} required />
              </label>
              <label className="field"><span>New password</span>
                <input type="password" autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} minLength={10} maxLength={128} required />
              </label>
              <label className="field"><span>Confirm new password</span>
                <input type="password" autoComplete="new-password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} minLength={10} maxLength={128} required />
              </label>
              {error && <p role="alert" className="error">{error}</p>}
              <button className="btn btn-primary auth-submit" disabled={busy}>
                {busy ? 'Updating password…' : 'Reset password'}
              </button>
              <button className="btn btn-secondary auth-submit" type="button" disabled={busy}
                onClick={async () => {
                  setBusy(true); setError('');
                  try {
                    await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
                    setMessage('A new reset code has been sent if an active account exists.');
                    setCode('');
                  } catch (err) { setError(err.message); }
                  setBusy(false);
                }}>Send a new code</button>
            </form>
          )}

          {step === 'done' && <p role="status" className="notice">{message}</p>}
          <p className="auth-meta">
            <Link to="/login">Back to sign in</Link>
            <Link to="/">Back to home</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
