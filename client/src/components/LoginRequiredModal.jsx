import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal.jsx';

// UX only: the API enforces real access. `destination` is carried through login when it is a safe internal path.
export function LoginRequiredModal({ destination, onClose }) {
  const navigate = useNavigate();
  return (
    <Modal title="Login Required" onClose={onClose} labelledBy="login-required-title">
      <p style={{ marginBottom: '.5rem' }}><Lock size={28} aria-hidden="true" style={{ color: 'var(--brand)' }} /></p>
      <p className="muted">Sign in to CampusPages to access this study material and start reading your notes.</p>
      <div className="cta-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" data-autofocus
          onClick={() => navigate('/login', { state: destination ? { from: destination } : undefined })}>Sign In</button>
      </div>
    </Modal>
  );
}
