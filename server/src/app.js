import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import health from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { originCheck } from './middleware/auth.js';
import { publicRouter } from './routes/public.js';
import { documentsRouter } from './routes/documents.js';
import { adminRouter } from './routes/admin.js';
import { createStorage } from './storage/index.js';
import rateLimit from 'express-rate-limit';
import { requestLogger } from './middleware/requestLogger.js';
import { requestTimeout } from './middleware/timeout.js';
import { httpError } from './middleware/auth.js';
import { CSP_DIRECTIVES } from './config/csp.js';
import { notFound, errorHandler } from './middleware/errors.js';

export function createApp(config, { storage = createStorage(config) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false); // authenticated JSON must never be revalidated from a cache
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(requestLogger(config));
  app.use(helmet({ contentSecurityPolicy: { useDefaults: false, directives: { ...CSP_DIRECTIVES, ...(config.isProd ? { upgradeInsecureRequests: [] } : {}) } } }));
  app.use((_req, res, next) => { res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'); next(); });
  app.use(cors({
    credentials: true,
    origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin)),
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(originCheck(config));
  app.use('/api/health', health);
  // Everything below /api: global per-IP limit, bounded request time, and no caching of account/admin data.
  app.use('/api', rateLimit({ windowMs: 60_000, limit: config.apiMaxPerMinute, standardHeaders: true, legacyHeaders: false, validate: false,
    handler: (_q, _s, next) => next(httpError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.')) }));
  app.use('/api', requestTimeout(config.requestTimeoutMs, (req) => /^\/documents\/[^/]+\/content$/.test(req.path) || (req.method === 'POST' && req.path === '/admin/documents')));
  app.use(['/api/auth', '/api/admin'], (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/auth', authRouter(config));
  app.use('/api/public', publicRouter(config));
  app.use('/api/documents', documentsRouter(config, { storage }));
  app.use('/api/admin', adminRouter(config, { storage }));
  app.use('/api', notFound);
  if (config.serveClient) {
    // Single-origin deployment: the API serves the built frontend, so cookies are first-party and no CORS is needed.
    const dist = config.clientDist; const index = path.join(dist, 'index.html');
    if (!fs.existsSync(index)) throw new Error(`SERVE_CLIENT=true but ${index} was not found. Run "npm run build" first.`);
    app.use(express.static(dist, { index: false, redirect: false, dotfiles: 'ignore', setHeaders: (res, file) => {
      res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache'); } }));
    app.get(/^\/(?!api(\/|$)).*/, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(index)); // SPA routes
  }
  app.use(errorHandler);
  app.locals.storage = storage;
  return app;
}
