import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { FileText, LayoutDashboard, LogOut, Menu, Upload, X } from 'lucide-react';
import { BrandLogo } from '../../components/BrandLogo.jsx';
import { ThemeToggle } from '../../components/ThemeToggle.jsx';
import { ToastProvider } from '../../components/Toast.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

const NAV = [['/admin', 'Dashboard', LayoutDashboard, true], ['/admin/upload', 'Upload', Upload], ['/admin/documents', 'Documents', FileText]];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const btn = useRef(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  return (
    <ToastProvider>
      <a className="skip" href="#main">Skip to content</a>
      <div className="admin">
        <aside className={`sidebar${open ? ' open' : ''}`} id="admin-sidebar" aria-label="Admin">
          <div className="sidebar-brand"><BrandLogo to="/admin" /></div>
          <nav aria-label="Admin navigation"><ul>
            {NAV.map(([to, label, Icon, end]) => (
              <li key={to}><NavLink to={to} end={end} className="side-link"><Icon size={20} aria-hidden="true" />{label}</NavLink></li>
            ))}
          </ul></nav>
        </aside>
        <div className="admin-main">
          <header className="admin-top">
            <button ref={btn} type="button" className="btn icon-btn only-mobile" aria-expanded={open} aria-controls="admin-sidebar"
              aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>{open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>
            <span className="muted admin-user">{user?.name}</span>
            <div className="nav-actions"><ThemeToggle />
              <button type="button" className="btn" onClick={logout}><LogOut size={18} aria-hidden="true" /><span>Sign out</span></button></div>
          </header>
          <main id="main" className="admin-content"><Outlet /></main>
        </div>
      </div>
    </ToastProvider>
  );
}
