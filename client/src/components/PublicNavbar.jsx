import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo.jsx';
import { useAuth, homeFor } from '../features/auth/AuthProvider.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/subjects', label: 'Explore Subjects' },
  { to: '/#features', label: 'Features' },
];

export function PublicNavbar() {
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const { pathname, hash } = useLocation();
  const btn = useRef(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (pathname !== '/' || hash !== '#features') return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, hash]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const closeMenuAndScrollToFeatures = () => {
    setOpen(false);
    if (pathname === '/') {
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header className="nav">
      <div className="container">
        <nav className="nav-inner" aria-label="Main">
          <BrandLogo />
          <ul className="nav-links">
            {LINKS.map((l) => (
              <li key={l.label}>
                <Link
                  to={l.to}
                  onClick={l.label === 'Features' ? closeMenuAndScrollToFeatures : () => setOpen(false)}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="nav-actions">
            <ThemeToggle />
            {auth?.user ? (
              <Link to={homeFor(auth.user)} className="btn btn-primary nav-login">My dashboard</Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-secondary nav-login">Create account</Link>
                <Link to="/login" className="btn btn-primary nav-login">Student Login</Link>
              </>
            )}
            <button ref={btn} type="button" className="btn icon-btn only-mobile" aria-expanded={open}
              aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
              {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </nav>
        {open && (
          <div id="mobile-menu" className="nav-menu">
            <ul>
              {LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    onClick={l.label === 'Features' ? closeMenuAndScrollToFeatures : () => setOpen(false)}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                {auth?.user ? (
                  <Link to={homeFor(auth.user)} className="btn btn-primary">My dashboard</Link>
                ) : (
                  <>
                    <Link to="/register" className="btn btn-secondary">Create account</Link>
                    <Link to="/login" className="btn btn-primary">Student Login</Link>
                  </>
                )}
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}
