export function FeatureCard({ icon: Icon, title, children, image, imageAlt = '', style }) {
  return (
    <li className="card feature-card" style={{ listStyle: 'none', ...style }}>
      <div className="feature-image-wrap">
        <img className="feature-card-image" src={image} alt={imageAlt} loading="lazy" decoding="async" />
        <div className="feature-image-overlay" />
      </div>
      <div className="feature-card-content">
        <span className="feature-icon"><Icon size={22} aria-hidden="true" /></span>
        <h3>{title}</h3>
        <p className="muted" style={{ marginBottom: 0 }}>{children}</p>
      </div>
    </li>
  );
}
