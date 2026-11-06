// The single source of truth for the Content-Security-Policy. client/public/_headers (for static hosts) must stay identical;
// tests/static.test.js compares them.
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'blob:', 'data:', 'https://images.unsplash.com'], fontSrc: ["'self'"],
  connectSrc: ["'self'"], workerSrc: ["'self'", 'blob:'], objectSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'self'"], frameAncestors: ["'none'"],
};
const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export const CSP_STRING = Object.entries(CSP_DIRECTIVES).map(([k, v]) => `${kebab(k)} ${v.join(' ')}`).join('; ');
