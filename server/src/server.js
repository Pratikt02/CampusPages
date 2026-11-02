import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import mongoose from 'mongoose';
import { loadConfig } from './config/env.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { startCleanupJob } from './jobs/cleanup.js';
import { log } from './utils/logger.js';

const config = loadConfig();
const app = createApp(config);
startCleanupJob({ storage: app.locals.storage, config });
if (config.isProd && !config.trustProxy) log.warn('TRUST_PROXY is not set: behind a proxy, rate limits will see the proxy IP instead of the client IP.');

const server = app.listen(config.port, () => log.info('API listening', { port: config.port }));
// Slow-client protection (Slowloris): headers must arrive quickly; whole requests (incl. uploads) are bounded.
server.headersTimeout = 20_000; server.requestTimeout = 180_000; server.keepAliveTimeout = 5_000;

connectDb(config.mongoUri).catch((e) =>
  log.error('MongoDB connection failed', { reason: e.message.split('\n')[0].replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]') }));

let stopping = false;
function shutdown(signal, code = 0) {
  if (stopping) return; stopping = true;
  log.info('Shutting down', { signal });
  setTimeout(() => process.exit(1), 10_000).unref(); // hard stop if connections will not drain
  server.close(async () => { await mongoose.disconnect().catch(() => {}); process.exit(code); });
  server.closeIdleConnections?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (r) => log.error('Unhandled rejection', { name: r?.name }));
process.on('uncaughtException', (e) => { log.error('Uncaught exception', { name: e?.name }); shutdown('uncaughtException', 1); });
