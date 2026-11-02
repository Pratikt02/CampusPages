// Bounds ordinary JSON requests. (Upload and content streaming have their own, different limits and are skipped.)
export const requestTimeout = (ms, skip = () => false) => (req, res, next) => {
  if (skip(req)) return next();
  const timer = setTimeout(() => {
    if (res.headersSent) return;
    res.status(503).json({ error: { code: 'TIMEOUT', message: 'The request took too long. Please try again.' } });
    res.json = () => res; res.send = () => res; // a handler that finishes late must not try to answer a second time
  }, ms);
  const clear = () => clearTimeout(timer);
  res.on('finish', clear); res.on('close', clear);
  next();
};
