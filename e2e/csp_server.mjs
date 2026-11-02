// Serves client/dist with the headers from client/public/_headers (the real file) and proxies /api to the API.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dist = '/home/claude/campuspages/client/dist';
const blocks = {}; let cur = null;
for (const line of fs.readFileSync('/home/claude/campuspages/client/public/_headers', 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  if (!/^\s/.test(line)) { cur = line.trim(); blocks[cur] = []; } else { const i = line.indexOf(':'); blocks[cur].push([line.slice(0, i).trim(), line.slice(i + 1).trim()]); }
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const up = http.request({ host: '127.0.0.1', port: 4000, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(up); return;
  }
  let f = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  const h = { 'Content-Type': types[path.extname(f)] ?? 'application/octet-stream' };
  for (const [k, v] of blocks['/*'] ?? []) h[k] = v;
  if (req.url.startsWith('/assets/')) for (const [k, v] of blocks['/assets/*'] ?? []) h[k] = v;
  res.writeHead(200, h); fs.createReadStream(f).pipe(res);
}).listen(5173, () => console.log('csp server up'));
