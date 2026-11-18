import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/dist');

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const origins = (env.CLIENT_ORIGINS || 'http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const isProd = nodeEnv === 'production';
  if (isProd && origins.some((o) => o === '*' || !o.startsWith('https://'))) {
    throw new Error('CLIENT_ORIGINS must be explicit https:// origins in production');
  }
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const cld = [env.CLOUDINARY_CLOUD_NAME, env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET].every(Boolean);
  const storageDriver = env.STORAGE_DRIVER || (cld ? 'cloudinary' : 'memory');
  if (!['cloudinary', 'memory'].includes(storageDriver)) throw new Error('STORAGE_DRIVER must be cloudinary or memory');
  if (storageDriver === 'cloudinary' && !cld) throw new Error('Cloudinary credentials are missing');
  if (isProd && storageDriver !== 'cloudinary') throw new Error('Production requires STORAGE_DRIVER=cloudinary');
  return Object.freeze({
    nodeEnv, isProd,
    port: num(env.PORT, 4000),
    clientOrigins: origins,
    mongoUri: env.MONGODB_URI || '',
    trustProxy: env.TRUST_PROXY === 'true',
    // __Host- prefix (prod) forces Secure, Path=/, no Domain.
    cookieName: isProd ? '__Host-cp_sid' : 'cp_sid',
    sessionIdleMinutes: num(env.SESSION_IDLE_MINUTES, 60),
    sessionAbsoluteHours: num(env.SESSION_ABSOLUTE_HOURS, 12),
    loginMaxPerWindow: num(env.LOGIN_MAX_PER_15MIN, 30), // FAILED attempts per IP per 15 min (a campus NAT shares one IP)
    storageDriver,
    cloudinary: { cloudName: env.CLOUDINARY_CLOUD_NAME || '', apiKey: env.CLOUDINARY_API_KEY || '', apiSecret: env.CLOUDINARY_API_SECRET || '' },
    maxUploadBytes: Math.floor(num(env.MAX_UPLOAD_MB, 10) * 1024 * 1024),
    maxPdfPages: num(env.MAX_PDF_PAGES, 500),
    maxImageMegapixels: num(env.MAX_IMAGE_MEGAPIXELS, 25),
    maxConcurrentUploads: num(env.MAX_CONCURRENT_UPLOADS, 3),
    maxStreamsGlobal: num(env.MAX_STREAMS_GLOBAL, 200),
    maxStreamsPerUser: num(env.MAX_STREAMS_PER_USER, 12),
    contentMaxPerMinute: num(env.CONTENT_MAX_PER_MIN, 300),
    streamTimeoutMs: Math.floor(num(env.STREAM_TIMEOUT_SECONDS, 120) * 1000),
    upstreamTimeoutMs: num(env.UPSTREAM_TIMEOUT_MS, 15000),
    logRequests: env.LOG_REQUESTS ? env.LOG_REQUESTS === 'true' : nodeEnv !== 'test',
    apiMaxPerMinute: num(env.API_MAX_PER_MIN, 3000), // per IP; a campus NAT shares one IP, and opening one PDF can take 10-30 requests
    loginMaxPerAccount: num(env.LOGIN_MAX_PER_ACCOUNT_15MIN, 20),
    maxSessionsPerUser: num(env.MAX_SESSIONS_PER_USER, 5),
    requestTimeoutMs: num(env.REQUEST_TIMEOUT_MS, 30000),
    pdfParseTimeoutMs: num(env.PDF_PARSE_TIMEOUT_MS, 10000),
    serveClient: env.SERVE_CLIENT === 'true',
    clientDist: path.resolve(env.CLIENT_DIST || DEFAULT_DIST),
    publicMaxPerMinute: num(env.PUBLIC_MAX_PER_MIN, 120),
    cleanupAfterMinutes: num(env.CLEANUP_AFTER_MINUTES, 30),
  });
}
