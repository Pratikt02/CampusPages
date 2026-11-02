import { Link } from 'react-router-dom';
import { BrandLogo } from './BrandLogo.jsx';
import { BRAND } from '../brand.js';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand-column">
          <BrandLogo showSlogan />
          <p className="text-dim" style={{ marginTop: '1.5rem', fontSize: '0.95rem', lineHeight: '1.6' }}>
            CampusPages is the digital reading room built for students. Access academic resources, discover study materials, and read protected content seamlessly on any device.
          </p>
        </div>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text)', marginBottom: '1.5rem' }}>Platform</div>
          <nav aria-label="Footer Platform">
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/subjects">Explore Subjects</Link></li>
              <li><Link to="/login">Student Login</Link></li>
            </ul>
          </nav>
        </div>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text)', marginBottom: '1.5rem' }}>Support</div>
          <nav aria-label="Footer Support">
            <ul>
              <li><a href="mailto:support@campuspages.edu">Support Email</a></li>
              <li><a href="#privacy">Privacy Policy</a></li>
              <li><a href="#terms">Terms of Service</a></li>
            </ul>
          </nav>
        </div>
      </div>
      <div className="container footer-bottom">
        <p style={{ margin: 0, fontSize: '.9rem' }}>
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
        <p style={{ margin: 0, fontSize: '.9rem' }}>
          Built with focus for the next generation of learners.
        </p>
      </div>
    </footer>
  );
}
