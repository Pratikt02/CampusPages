import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BRAND } from '../brand.js';

const DEFAULT_DESCRIPTION = 'Discover organized study notes, course readings, and academic resources by subject with CampusPages, a digital reading room for students.';
const ROUTE_META = {
  '/': { title: 'Study notes and academic resources', description: DEFAULT_DESCRIPTION, index: true },
  '/subjects': { title: 'Browse subjects and study materials', description: 'Explore published academic subjects and find study materials for your classes and exams.', index: true },
  '/login': { title: 'Student login', description: 'Sign in to access your CampusPages study library.', index: false },
  '/register': { title: 'Create a student account', description: 'Create a CampusPages account to access your course study materials.', index: false },
  '/signup': { title: 'Create a student account', description: 'Create a CampusPages account to access your course study materials.', index: false },
};

function setMeta(selector, attribute, value) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    const [key, name] = selector.match(/\[(name|property)="([^"]+)"\]/).slice(1);
    element.setAttribute(key, name);
    document.head.append(element);
  }
  element.setAttribute(attribute, value);
}

export default function Seo({ title, description, noIndex = false }) {
  const { pathname } = useLocation();
  useEffect(() => {
    const route = ROUTE_META[pathname];
    const pageTitle = title || route?.title || 'Page not found';
    const pageDescription = description || route?.description || DEFAULT_DESCRIPTION;
    const privatePath = /^\/(app|admin)(\/|$)/.test(pathname) || ['/unauthorized', '/login', '/register', '/signup'].includes(pathname);
    const subjectPath = /^\/subjects\/[^/]+\/?$/.test(pathname);
    const index = !noIndex && (!!route?.index || subjectPath) && !privatePath;
    const origin = import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') || window.location.origin;

    document.title = `${pageTitle} | ${BRAND.name}`;
    setMeta('meta[name="description"]', 'content', pageDescription);
    setMeta('meta[name="robots"]', 'content', index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');
    setMeta('meta[property="og:title"]', 'content', `${pageTitle} | ${BRAND.name}`);
    setMeta('meta[property="og:description"]', 'content', pageDescription);
    setMeta('meta[name="twitter:title"]', 'content', `${pageTitle} | ${BRAND.name}`);
    setMeta('meta[name="twitter:description"]', 'content', pageDescription);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    if (origin && index) {
      canonical.href = `${origin}${pathname === '/' ? '/' : pathname}`;
      canonical.disabled = false;
    } else {
      canonical.removeAttribute('href');
    }
  }, [pathname, title, description, noIndex]);
  return null;
}
