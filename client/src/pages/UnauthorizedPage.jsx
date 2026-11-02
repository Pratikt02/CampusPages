import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { useAuth, homeFor } from '../features/auth/AuthProvider.jsx';

export default function UnauthorizedPage() {
  const { user } = useAuth();
  return (
    <main id="main" className="centered container">
      <div>
        <BrandLogo />
        <h1 style={{ marginTop: '1.5rem' }}>You don’t have access to this page</h1>
        <p className="muted" style={{ marginInline: 'auto' }}>Your account doesn’t have permission to view it.</p>
        <Link to={user ? homeFor(user) : '/'} className="btn btn-primary">Go back</Link>
      </div>
    </main>
  );
}
