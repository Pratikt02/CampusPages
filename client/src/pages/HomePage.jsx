import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenText, FileText, Layers, Lock, RefreshCw, Search, Smartphone, Sparkles } from 'lucide-react';
import { BRAND } from '../brand.js';
import { FeatureCard } from '../components/FeatureCard.jsx';
import { publicApi } from '../api/public.js';
import { useAsync } from '../hooks/useAsync.js';
import { libraryPathFor, useProtectedAction } from '../features/subjects/SubjectGrid.jsx';
import { docsApi } from '../api/documents.js';
import { useAuth } from '../features/auth/AuthProvider.jsx';

const FEATURES = [
  [Layers, 'Organized study materials', 'Notes grouped by subject so you can find the right document instantly.', '/images/feature-organized.jpg', 'Rows of books organized on library shelves'],
  [FileText, 'Protected PDF & image reader', 'Read approved documents in the browser with precise zoom and secure watermarking.', '/images/feature-reading.jpg', 'An open book ready for a focused reading session'],
  [Search, 'Instant search & filtering', 'Narrow your library effortlessly by subject and keyword.', '/images/feature-search.jpg', 'A laptop displaying a digital workspace'],
  [Smartphone, 'Study Anytime, Anywhere', 'Access available learning materials across desktop, tablet, and mobile devices.', '/images/feature-anywhere.jpg', 'A smartphone beside a laptop for studying on the go'],
  [Sparkles, 'A Distraction-Free Reading Experience', 'Read study documents in a dedicated interface designed to keep your focus on learning.', '/images/feature-workspace.jpg', 'A quiet aisle in a university library'],
  [Layers, 'Your Personal Study Space', 'Explore academic resources through a dedicated student dashboard and convenient navigation.', '/images/feature-protected.jpg', 'A student carrying a stack of books'],
  [Search, 'Make Every Study Session Count', 'Spend less time looking for resources and more time learning, revising, and preparing for exams.', '/images/feature-study.jpg', 'A student taking notes at a desk'],
  [Lock, 'Strictly protected resources', 'Documents are served securely only to authorized students.', '/images/feature-reader.jpg', 'A collection of books representing protected learning resources'],
];

export default function HomePage() {
  const { user } = useAuth();
  const subjects = useAsync((sig) => publicApi.subjects(sig), []);
  const recentNotes = useAsync((sig) => user ? docsApi.list({ page: '1', limit: '3' }, sig) : Promise.resolve({ items: [] }), [user?.id]);
  const subjectItems = subjects.data?.items ?? [];
  const featuredSubjects = subjectItems.slice(0, 3);
  const { open, modal } = useProtectedAction();
  const subjectScroller = useRef(null);
  const [subjectCopies, setSubjectCopies] = useState(1);

  useEffect(() => {
    if (!subjectItems.length) return undefined;
    const updateCopies = () => {
      const visibleCardsPerViewport = Math.max(1, Math.ceil(window.innerWidth / 304));
      setSubjectCopies(Math.ceil(visibleCardsPerViewport / subjectItems.length) + 1);
    };
    updateCopies();
    window.addEventListener('resize', updateCopies);
    return () => window.removeEventListener('resize', updateCopies);
  }, [subjectItems]);

  return (
    <>
      <section className="section hero-section">
        <img
          src="/images/feature-reading.jpg"
          alt=""
          className="hero-bg-image"
          loading="eager"
          decoding="async"
        />
        <div className="hero-section-scrim" />
        <div className="container hero">
          <div className="hero-copy">
            <span className="eyebrow">Premium learning platform</span>
            <div className="hero-accent" />
            <h1>
              {BRAND.name}<br />
              <span className="hero-tagline">{BRAND.slogan}</span>
            </h1>
            <p>Study smarter with a beautifully organized library of notes, readings, and protected academic resources designed for modern student life.</p>
            <div className="cta-row">
              <a href="#subjects" className="btn btn-primary"><BookOpenText size={20} aria-hidden="true" />Explore Study Materials</a>
              <Link to="/register" className="btn btn-secondary">Create Account</Link>
              <Link to="/login" className="btn">Student Login</Link>
            </div>
            <ul className="hero-metrics" aria-label="CampusPages highlights">
              <li className="hero-metric-card">
                <img src="/images/study-fast.jpg" alt="" />
                <strong>Fast</strong>
                <span>Find resources quickly</span>
              </li>
              <li className="hero-metric-card">
                <img src="/images/study-secure.jpg" alt="" />
                <strong>Secure</strong>
                <span>Protected study materials</span>
              </li>
              <li className="hero-metric-card">
                <img src="/images/study-mobile.jpg" alt="" />
                <strong>Mobile</strong>
                <span>Learn on any device</span>
              </li>
            </ul>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-glow" />
            <div className="hero-card hero-main-card">
              <div className="hero-illustration-wrap">
                <img
                  src="/images/hero-girl-reading.jpg"
                  alt="A girl reading a book in a bright reading space"
                  className="hero-illustration-img"
                  loading="eager"
                  decoding="async"
                />
              </div>
            </div>
            <div className="hero-card hero-floating-card hero-card-top">
              <span className="mini-label">Today’s focus</span>
              <strong>Research Methods</strong>
              <small>6 study notes ready</small>
            </div>
            <div className="hero-card hero-floating-card hero-card-bottom">
              <span className="mini-label">Progress</span>
              <div className="progress-row">
                <div className="progress-bar"><span /></div>
                <strong>82%</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="section feature-section" aria-labelledby="features-h">
        <div className="feature-bg">
          <div className="feature-glow feature-glow-1" />
          <div className="feature-glow feature-glow-2" />
          <div className="feature-glow feature-glow-3" />
        </div>
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">Built for academic focus</span>
            <h2 id="features-h">Everything students need in one elegant workspace</h2>
            <p className="muted">From subject discovery to protected reading, every detail is optimized for clarity, speed, and deep learning.</p>
          </div>
          <ul className="grid feature-grid" style={{ padding: 0, margin: 0 }}>
            {FEATURES.map(([icon, title, text, image, imageAlt], idx) => (
              <FeatureCard key={title} icon={icon} title={title} image={image} imageAlt={imageAlt} style={{ animationDelay: `${idx * 0.1}s` }}>{text}</FeatureCard>
            ))}
          </ul>
        </div>
      </section>

      <section className="section showcase-section" aria-labelledby="showcase-h">
        <div className="container showcase-grid">
          <div className="showcase-copy">
            <span className="eyebrow">Study beautifully</span>
            <h2 id="showcase-h">An experience designed around real academic workflows</h2>
            <ul className="check-list">
              <li>Organized content by subject, course, and material type.</li>
              <li>Protected reading environment for PDFs and images.</li>
              <li>Fast filtering and retrieval with a clear, distraction-free layout.</li>
            </ul>
          </div>
          <div className="showcase-panel card">
            <div className="showcase-header">
              <span className="badge badge-neutral">Course library</span>
              <span className="text-dim small">Updated this week</span>
            </div>
            {featuredSubjects.length ? (
              featuredSubjects.map((subject) => {
                const count = subject.materialCount ?? 0;
                return (
                  <div key={subject.id} className="showcase-resource">
                    <div>
                      <strong>{subject.name}</strong>
                      <p className="muted">
                        {count} {count === 1 ? 'study material' : 'study materials'}
                        {subject.description ? ` · ${subject.description}` : ''}
                      </p>
                    </div>
                    <Link to={`/subjects/${subject.id}`} className="btn btn-small btn-primary">Open</Link>
                  </div>
                );
              })
            ) : (
              <div className="showcase-resource">
                <div>
                  <strong>No subjects available yet</strong>
                  <p className="muted">New study material will appear here as it is published.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section notes-explore-section" aria-labelledby="notes-explore-h">
        <div className="container">
          <div className="section-header-row">
            <div><span className="eyebrow">Explore notes</span><h2 id="notes-explore-h">Find materials for your academic year</h2><p className="muted">Choose a year to browse its branches, semesters, subjects, and published materials.</p></div>
            <Link to={user ? '/app/notes' : '/login'} state={!user ? { from: '/app/notes' } : undefined} className="linklike">Open Notes Library <span className="link-arrow">→</span></Link>
          </div>
          <div className="home-year-grid">
            {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((year, i) => <Link key={year} to={user ? `/app/notes?category=engineering&year=${i + 1}` : '/login'} state={!user ? { from: '/app/notes' } : undefined} className="home-year-card" style={{ '--year-index': i }}><span className="home-year-number">0{i + 1}</span><strong>{year}</strong><small>CS · IT · ENTC · MECH · Civil · AIDS</small><span className="home-year-arrow" aria-hidden="true">↗</span></Link>)}
            <Link to={user ? '/app/notes?category=other' : '/login'} state={!user ? { from: '/app/notes' } : undefined} className="home-year-card home-year-other" style={{ '--year-index': 4 }}><span className="home-year-number"><BookOpenText size={20} /></span><strong>Other Standards</strong><small>Classes and courses</small><span className="home-year-arrow" aria-hidden="true">↗</span></Link>
          </div>
          {user && <div className="home-recent-notes">
            <div className="section-header-row"><div><span className="eyebrow">Recently published</span><h3>Fresh from the library</h3></div><Link to="/app/notes" className="linklike">See all materials <span className="link-arrow">→</span></Link></div>
            {recentNotes.loading && !recentNotes.data ? <p className="muted">Loading recent materials…</p> : recentNotes.error ? <p className="muted">Recent materials are unavailable right now.</p> : recentNotes.data?.items.length ? <div className="home-recent-list">{recentNotes.data.items.map((note) => <Link key={note.id} to={`/app/documents/${note.id}`} className="home-recent-item"><span><strong>{note.title}</strong><small>{[note.subject?.name, note.academicCategory === 'engineering' ? `${note.academicYear}${note.academicYear === 1 ? 'st' : note.academicYear === 2 ? 'nd' : note.academicYear === 3 ? 'rd' : 'th'} Year · ${note.branch}` : note.standard, note.semester && `Semester ${note.semester}`].filter(Boolean).join(' · ')}</small></span><span aria-hidden="true">→</span></Link>)}</div> : <p className="muted">No published materials yet.</p>}
          </div>}
        </div>
      </section>

      <section id="subjects" className="section subjects-section" aria-labelledby="subjects-h">
        <div className="subjects-bg">
          <div className="subject-glow subject-glow-1" />
          <div className="subject-glow subject-glow-2" />
          <div className="subject-glow subject-glow-3" />
        </div>
        <div className="container">
          <div className="section-header-row">
            <div>
              <span className="eyebrow">Explore subjects</span>
              <h2 id="subjects-h">Discover study material by discipline</h2>
            </div>
            <Link to="/subjects" className="linklike">View all subjects <span className="link-arrow">→</span></Link>
          </div>
          {subjects.loading && !subjects.data ? (
            <div className="subject-scroller subject-scroller-loading" aria-live="polite">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="subject-scroll-card subject-card-skeleton" />)}
            </div>
          ) : subjects.error ? (
            <div className="card empty-inline-state" role="alert">
              <p>Subjects could not be loaded right now.</p>
              <button type="button" className="btn btn-small" onClick={subjects.reload}>
                <RefreshCw size={16} aria-hidden="true" /> Try again
              </button>
            </div>
          ) : (!subjects.data?.items?.length ? (
            <div className="card empty-inline-state">No subjects are published yet.</div>
          ) : (
            <div
              ref={subjectScroller}
              className="subject-scroller"
              role="region"
              aria-label="Published subjects"
              tabIndex={0}
            >
              <div className={`subject-scroll-track${subjectItems.length < 2 ? ' subject-scroll-track-static' : ''}`}>
                {[0, 1].map((group) => (
                  <div
                    key={group}
                    className="subject-scroll-group"
                    aria-hidden={group === 1 ? 'true' : undefined}
                  >
                    {Array.from({ length: subjectCopies }, (_, copy) => subjectItems.map((subject) => {
                      const count = subject.materialCount ?? 0;
                      const decorativeCopy = group === 1 || copy > 0;
                      return (
                        <article
                          key={`${group}-${copy}-${subject.id}`}
                          className="subject-scroll-card card"
                          aria-hidden={decorativeCopy ? 'true' : undefined}
                          onMouseEnter={(event) => {
                            const scroller = event.currentTarget.closest('.subject-scroller');
                            scroller?.classList.add('is-card-paused');
                          }}
                          onMouseLeave={(event) => {
                            const scroller = event.currentTarget.closest('.subject-scroller');
                            window.requestAnimationFrame(() => {
                              if (!scroller?.querySelector('.subject-scroll-card:hover') && !scroller?.querySelector(':focus')) {
                                scroller?.classList.remove('is-card-paused');
                              }
                            });
                          }}
                          onFocusCapture={(event) => {
                            event.currentTarget.closest('.subject-scroller')?.classList.add('is-card-paused');
                          }}
                          onBlurCapture={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                              const scroller = event.currentTarget.closest('.subject-scroller');
                              if (!scroller?.querySelector(':focus') && !scroller?.querySelector('.subject-scroll-card:hover')) {
                                scroller?.classList.remove('is-card-paused');
                              }
                            }
                          }}
                        >
                          <span className="subject-scroll-tag">{count} {count === 1 ? 'study material' : 'study materials'}</span>
                          <Link to={`/subjects/${subject.id}`} className="subject-scroll-title">{subject.name}</Link>
                          <p>{subject.description || 'Browse course notes, readings, and study material.'}</p>
                          <div className="subject-scroll-actions">
                            <button type="button" className="btn btn-small btn-primary" onClick={() => open(libraryPathFor(subject.id))} aria-label={`View Notes for ${subject.name}`}>View Notes</button>
                          </div>
                        </article>
                      );
                    }))}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {modal}
        </div>
      </section>

      <section className="section cta-section" aria-labelledby="cta-h">
        <div className="container">
          <div className="cta-card">
            <div className="cta-copy">
              <span className="eyebrow">Your next study session starts here</span>
              <h2 id="cta-h">Ready to start reading?</h2>
              <p>Find your course materials, settle in, and keep your focus on learning. Your study space is just a step away.</p>
            </div>
            <div className="cta-actions">
              <Link to="/register" className="btn btn-primary">
                Create your account <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/login" className="cta-login-link">Already registered? Sign in</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}



