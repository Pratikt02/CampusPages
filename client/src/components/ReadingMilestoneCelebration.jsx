import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import './ReadingMilestoneCelebration.css';

const COLORS = ['#fde047', '#38bdf8', '#f472b6', '#34d399', '#a855f7', '#fb923c', '#ffffff'];
const CIRCUMFERENCE = 2 * Math.PI * 66;
const FOCUSABLE = 'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

function drawStar(ctx, radius) {
  ctx.beginPath();
  for (let point = 0; point < 8; point += 1) {
    const angle = (Math.PI / 4) * point - Math.PI / 2;
    const size = point % 2 === 0 ? radius : radius * 0.35;
    const x = Math.cos(angle) * size;
    const y = Math.sin(angle) * size;
    if (point === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function CelebrationConfetti({ isOpen, ringRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let burstTimer = 0;
    let particles = [];
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const resize = () => {
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const createParticle = (x, y, angle, speed) => ({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: ['ribbon', 'star', 'circle', 'diamond'][Math.floor(Math.random() * 4)],
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.22,
      phase: Math.random() * Math.PI * 2,
      age: 0,
    });

    const burst = () => {
      const rect = ringRef.current?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : width / 2;
      const centerY = rect ? rect.top + rect.height / 2 : height / 2;
      for (let i = 0; i < 110; i += 1) {
        particles.push(createParticle(centerX, centerY, -Math.PI + Math.random() * Math.PI, 3 + Math.random() * 8));
      }
      for (let i = 0; i < 30; i += 1) {
        particles.push(createParticle(0, height * 0.72, -1.35 + Math.random() * 0.9, 5 + Math.random() * 6));
        particles.push(createParticle(width, height * 0.72, -2.7 + Math.random() * 0.9, 5 + Math.random() * 6));
      }
      frame = requestAnimationFrame(animate);
    };

    const drawParticle = (particle, fade) => {
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.scale(Math.cos(particle.age * 0.12), 1);
      context.globalAlpha = fade;
      context.fillStyle = particle.color;
      if (particle.shape === 'circle') {
        context.beginPath();
        context.arc(0, 0, particle.size * 0.48, 0, Math.PI * 2);
        context.fill();
      } else if (particle.shape === 'star') {
        drawStar(context, particle.size);
      } else if (particle.shape === 'diamond') {
        context.beginPath();
        context.moveTo(0, -particle.size);
        context.lineTo(particle.size * 0.55, 0);
        context.lineTo(0, particle.size);
        context.lineTo(-particle.size * 0.55, 0);
        context.closePath();
        context.fill();
      } else {
        context.fillRect(-particle.size * 0.42, -particle.size, particle.size * 0.84, particle.size * 2);
      }
      context.restore();
    };

    function animate() {
      context.clearRect(0, 0, width, height);
      const live = [];
      particles.forEach((particle) => {
        particle.age += 1;
        particle.vx *= 0.955;
        particle.vy = particle.vy * 0.955 + 0.22;
        particle.x += particle.vx + Math.sin(particle.age * 0.06 + particle.phase) * 1.15;
        particle.y += particle.vy;
        particle.rotation += particle.rotationSpeed;
        const bottomFade = Math.max(0, Math.min(1, (height - particle.y) / (height * 0.22)));
        const ageFade = Math.max(0, 1 - particle.age / 480);
        drawParticle(particle, Math.min(bottomFade, ageFade));
        if (particle.y < height + 24 && particle.age < 480) live.push(particle);
      });
      particles = live;
      if (particles.length) frame = requestAnimationFrame(animate);
    }

    resize();
    window.addEventListener('resize', resize);
    if (!reducedMotion) burstTimer = window.setTimeout(burst, 1050);
    return () => {
      window.clearTimeout(burstTimer);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      context.clearRect(0, 0, width, height);
      particles = [];
    };
  }, [isOpen, ringRef]);

  if (!isOpen) return null;
  return <canvas ref={canvasRef} className="reading-celebration-confetti" aria-hidden="true" />;
}

export default function ReadingMilestoneCelebration({
  isOpen,
  onClose,
  durationLabel = '1h',
  badgeLabel = 'STREAK',
  title = 'Congrats, buddy!',
  subtitle = 'You completed 1 hour of reading!',
  buttonText = 'Continue Reading',
}) {
  const cardRef = useRef(null);
  const ringRef = useRef(null);
  const componentId = useId().replace(/:/g, '');
  const closeRef = useRef(onClose);
  const previousFocus = useRef(null);
  const [entered, setEntered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocus.current = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setEntered(false);
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current?.();
      }
      if (event.key !== 'Tab' || !cardRef.current) return;
      const controls = [...cardRef.current.querySelectorAll(FOCUSABLE)];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    const focusTimer = window.setTimeout(() => cardRef.current?.querySelector('[data-autofocus]')?.focus(), 150);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = oldOverflow;
      previousFocus.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const subtitleParts = subtitle.split(/(\b\d+\s+hours?\b)/i);
  const updateTilt = (event) => {
    if (event.pointerType !== 'mouse' || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -y * 10, y: x * 10 });
  };

  return (
    <div
      className="reading-celebration-overlay"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <div className="reading-celebration-aurora reading-celebration-aurora-purple" aria-hidden="true" />
      <div className="reading-celebration-aurora reading-celebration-aurora-cyan" aria-hidden="true" />
      <CelebrationConfetti isOpen={isOpen} ringRef={ringRef} />
      <section
        ref={cardRef}
        className={`reading-celebration-card${entered ? ' is-entered' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${componentId}-title`}
        aria-describedby={`${componentId}-subtitle`}
        style={{ '--tilt-x': `${tilt.x}deg`, '--tilt-y': `${tilt.y}deg` }}
        onPointerMove={updateTilt}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        onAnimationEnd={(event) => { if (event.animationName === 'reading-card-spring-in') setEntered(true); }}
      >
        <div className="reading-celebration-sheen" aria-hidden="true" />
        <button type="button" className="reading-celebration-close" onClick={onClose} aria-label="Close celebration"><X size={19} aria-hidden="true" /></button>
        <div className="reading-celebration-ring-wrap" ref={ringRef}>
          <div className="reading-celebration-ring-aura" aria-hidden="true" />
          <div className="reading-celebration-shockwave" aria-hidden="true" />
          <span className="reading-celebration-sparkle reading-celebration-sparkle-one" aria-hidden="true">✦</span>
          <span className="reading-celebration-sparkle reading-celebration-sparkle-two" aria-hidden="true">✧</span>
          <svg className="reading-celebration-ring" viewBox="0 0 144 144" role="img" aria-label={`${durationLabel} reading milestone`}>
            <defs>
              <linearGradient id={`${componentId}-ring-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fde047" />
                <stop offset="52%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
              <linearGradient id={`${componentId}-label-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#bae6fd" />
              </linearGradient>
            </defs>
            <circle className="reading-celebration-ring-track" cx="72" cy="72" r="66" />
            <circle className="reading-celebration-ring-progress" cx="72" cy="72" r="66" stroke={`url(#${componentId}-ring-gradient)`} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE} />
            <text className="reading-celebration-duration" x="72" y="76" textAnchor="middle" fill={`url(#${componentId}-label-gradient)`}>{durationLabel}</text>
            <foreignObject x="35" y="84" width="74" height="27">
              <span xmlns="http://www.w3.org/1999/xhtml" className="reading-celebration-badge">{badgeLabel}</span>
            </foreignObject>
          </svg>
        </div>
        <div className="reading-celebration-copy">
          <div className="reading-celebration-emojis" aria-label="Celebration">
            <span aria-hidden="true">🎉</span><span aria-hidden="true">🥳</span><span aria-hidden="true">✨</span>
          </div>
          <p className="reading-celebration-overline">A little progress adds up</p>
          <h2 id={`${componentId}-title`} className="reading-celebration-title">{title}</h2>
          <p id={`${componentId}-subtitle`} className="reading-celebration-subtitle">
            {subtitleParts.map((part, index) => /\b\d+\s+hours?\b/i.test(part)
              ? <span className="reading-celebration-highlight" key={`${part}-${index}`}>{part}</span>
              : part)}
          </p>
        </div>
        <button type="button" className="reading-celebration-cta" data-autofocus onClick={onClose}>
          {buttonText}<ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
