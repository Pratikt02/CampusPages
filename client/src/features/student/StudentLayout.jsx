import { Link, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { BrandLogo } from '../../components/BrandLogo.jsx';
import { ThemeToggle } from '../../components/ThemeToggle.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

export default function StudentLayout() {
  const { user, logout } = useAuth();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="nav"><div className="container nav-inner">
        <BrandLogo to="/app" />
        <nav aria-label="Student" className="student-nav"><Link to="/app">Library</Link><Link to="/app/notes">Notes Library</Link><Link to="/subjects">Subjects</Link>{user?.role === 'admin' && <Link to="/admin">Admin</Link>}</nav>
        <div className="nav-actions"><ThemeToggle /><button type="button" className="btn" onClick={logout} aria-label="Sign out"><LogOut size={18} aria-hidden="true" /><span className="btn-label">Sign out</span></button></div>
      </div></header>
      <main id="main" className="container section student-shell"><Outlet /></main>
    </>
  );
}
