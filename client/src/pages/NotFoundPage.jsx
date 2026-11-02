import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo.jsx';

export default function NotFoundPage() {
  return (
    <main id="main" className="centered container">
      <div>
        <BrandLogo />
        <h1 style={{ marginTop: '1.5rem' }}>Page not found</h1>
        <p className="muted" style={{ marginInline: 'auto' }}>The page you are looking for doesn’t exist or has moved.</p>
        <Link to="/" className="btn btn-primary">Go to home</Link>
      </div>
    </main>
  );
}
