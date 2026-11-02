import { BrandLogo } from '../components/BrandLogo.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { useAuth } from '../features/auth/AuthProvider.jsx';

// Minimal signed-in landing for Phase 2. Real dashboards: student (Phase 4), admin (Phase 3).
export default function AccountHomePage({ area }) {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="nav"><div className="container nav-inner">
        <BrandLogo to="/" />
        <div className="nav-actions"><ThemeToggle /><button className="btn" onClick={logout}>Sign out</button></div>
      </div></header>
      <main id="main" className="container section">
        <h1>Welcome, {user.name}</h1>
        <p className="muted">You are signed in as {area}. The {area} dashboard is not built yet.</p>
      </main>
    </>
  );
}
