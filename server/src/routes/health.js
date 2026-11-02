import { Router } from 'express';
import { dbState } from '../config/db.js';
const r = Router();
// Intentionally minimal: no versions, config, hosts, or credentials.
r.get('/', (_req, res) => {
  const db = dbState();
  res.status(db === 'connected' ? 200 : 503).json({ status: db === 'connected' ? 'ok' : 'degraded', db });
});
export default r;
