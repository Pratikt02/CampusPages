import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, GraduationCap, Languages, Mail, Save, ShieldCheck, UserRound } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { useAuth } from '../features/auth/AuthProvider.jsx';
import { api } from '../api/client.js';

const LANGUAGES = [
  ['en', 'English'],
  ['hi', 'Hindi'],
  ['mr', 'Marathi'],
  ['gu', 'Gujarati'],
];

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const initials = (user?.name ?? 'Student')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    studentId: user?.studentId ?? '',
    course: user?.course ?? '',
    semester: user?.semester ?? '',
    branch: user?.branch ?? '',
    preferredLanguage: user?.preferredLanguage ?? 'en',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name ?? '',
      studentId: user.studentId ?? '',
      course: user.course ?? '',
      semester: user.semester ?? '',
      branch: user.branch ?? '',
      preferredLanguage: user.preferredLanguage ?? 'en',
    });
  }, [user]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      const data = await api('/auth/profile', {
        method: 'PATCH',
        body: {
          name: form.name,
          studentId: form.studentId || null,
          course: form.course,
          semester: form.semester ? Number(form.semester) : null,
          branch: form.branch || null,
          preferredLanguage: form.preferredLanguage,
        },
      });
      updateUser(data.user);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="nav"><div className="container nav-inner">
        <BrandLogo to={user?.role === 'admin' ? '/admin' : '/app'} />
        <nav aria-label="Account" className="student-nav"><Link to="/app">Library</Link><Link to="/profile">Profile</Link></nav>
        <div className="nav-actions"><ThemeToggle /><button type="button" className="btn btn-danger" onClick={logout}>Sign out</button></div>
      </div></header>
      <main id="main" className="container section profile-page">
        <section className="profile-hero" aria-label="Profile summary">
          <div className="profile-hero-pattern" aria-hidden="true" />
          <div className="profile-summary">
            <div className="profile-avatar" aria-hidden="true">{initials}</div>
            <div className="profile-summary-copy">
              <span className="profile-kicker">Student profile</span>
              <h1>{user?.name}</h1>
              <p><Mail size={16} aria-hidden="true" /> {user?.email}</p>
            </div>
          </div>
          <div className="profile-badges" aria-label="Profile information">
            {form.course && <span><GraduationCap size={16} aria-hidden="true" /> {form.course}</span>}
            {form.branch && <span>{form.branch} branch</span>}
            {form.semester && <span>Semester {form.semester}</span>}
            <span><ShieldCheck size={16} aria-hidden="true" /> Verified account</span>
          </div>
        </section>

        <section className="card profile-card" aria-labelledby="profile-details">
          <div className="profile-card-heading">
            <div className="profile-section-icon" aria-hidden="true"><UserRound size={20} /></div>
            <div><h2 id="profile-details">Profile details</h2><p>Keep your academic information up to date.</p></div>
          </div>
          <form onSubmit={submit} noValidate>
            <div className="profile-fields">
              <div className="field"><label htmlFor="profile-name">Name</label><input id="profile-name" value={form.name} onChange={set('name')} autoComplete="name" maxLength={100} required /></div>
              <div className="field"><label htmlFor="profile-student-id">College / student ID</label><input id="profile-student-id" value={form.studentId} onChange={set('studentId')} maxLength={40} placeholder="e.g. STU-2026-001" /></div>
              <div className="field profile-field-wide"><label htmlFor="profile-course">Course</label><input id="profile-course" value={form.course} onChange={set('course')} maxLength={120} placeholder="e.g. B.Tech Information Technology" /></div>
              <div className="field"><label htmlFor="profile-semester">Semester</label><select id="profile-semester" value={form.semester} onChange={set('semester')}><option value="">Not selected</option>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
              <div className="field"><label htmlFor="profile-branch">Branch</label><select id="profile-branch" value={form.branch} onChange={set('branch')}><option value="">Not selected</option>{['CS', 'IT', 'ENTC', 'MECH', 'Civil', 'AIDS'].map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></div>
              <div className="field profile-field-wide"><label htmlFor="profile-language">Preferred language</label><div className="profile-select-icon"><Languages size={18} aria-hidden="true" /><select id="profile-language" value={form.preferredLanguage} onChange={set('preferredLanguage')}>{LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
            </div>
            {error && <p className="error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
            {success && <p className="profile-success" role="status"><CheckCircle2 size={16} aria-hidden="true" /> {success}</p>}
            <div className="profile-actions"><button type="submit" className="btn btn-primary" disabled={busy}><Save size={18} aria-hidden="true" />{busy ? 'Saving…' : 'Save profile'}</button></div>
          </form>
        </section>
      </main>
    </>
  );
}
