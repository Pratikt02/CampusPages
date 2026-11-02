import { Link } from 'react-router-dom';
import { BRAND } from '../brand.js';

export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path d="M8 9.5c3-1.2 6-1 8 .8 2-1.8 5-2 8-.8V23c-3-1.2-6-1-8 .8-2-1.8-5-2-8-.8z" fill="var(--on-brand)" />
      <path d="M16 10.3v13" stroke="var(--brand)" strokeWidth="1.6" />
    </svg>
  );
}

export function BrandLogo({ to = '/', showSlogan = false }) {
  return (
    <Link to={to} className="brand" aria-label={`${BRAND.name} home`}>
      <LogoMark />
      <span>
        {BRAND.name}
        {showSlogan && <small>{BRAND.slogan}</small>}
      </span>
    </Link>
  );
}
