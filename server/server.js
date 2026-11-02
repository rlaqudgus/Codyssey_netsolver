// Dependency-free Node HTTP server: photo -> Claude -> net/option JSON.
// On EC2, Nginx serves public/ and /health and proxies only /api/ here (127.0.0.1:3000).
// The API key stays on the server (.env ANTHROPIC_API_KEY); the browser never sees it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt } from './prompt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (KEY=VALUE, # comments, optional quotes). Real env vars win.
function loadEnv(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return false; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let val = line.slice(eq + 1).trim();
    if (/^(["']).*\1$/.test(val)) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
  return true;
}
const envLoaded = loadEnv(process.env.ENV_FILE || path.join(ROOT, '.env'));

const HOST = process.env.HOST || '127.0.0.1';                // never 0.0.0.0 on the EC2 host itself
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const ACCESS_CODE = process.env.ACCESS_CODE || '';          // optional: set to require a code
const SERVE_STATIC = process.argv.includes('--static') || process.env.SERVE_STATIC === '1'; // local dev only: imitate Nginx
const MAX_B64 = 4_000_000;                                   // ~3 MB image
const MAX_BODY = 10 * 1024 * 1024;                           // matches Nginx client_max_body_size 10m
const UPSTREAM_TIMEOUT = 280_000;                            // below Nginx proxy_read_timeout 300s
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Best-effort in-memory rate limit (one process, so this is accurate until restart).
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = Number(process.env.RATE_PER_10MIN || 10);
  const arr = (hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { chunks = null; return; }       // keep draining so the 413 reaches the client
      if (chunks) chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks) return reject({ status: 413, code: 'too_large' });
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject({ status: 400, code: 'bad_request' }); }
    });
    req.on('error', () => reject({ status: 400, code: 'bad_request' }));
  });
}

// Nginx sets X-Real-IP to $remote_addr, which the client cannot forge
// (Node listens on 127.0.0.1, so every request comes through Nginx).
function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown');
}

async function analyze(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 500, { error: 'not_configured' });

  let payload;
  try { payload = await readJson(req); } catch (e) { return send(res, e.status, { error: e.code }); }
  const { image, mediaType = 'image/jpeg', memo = '', code = '' } = payload || {};
  if (ACCESS_CODE && code !== ACCESS_CODE) return send(res, 401, { error: 'code_required' });
  if (limited(clientIp(req))) return send(res, 429, { error: 'rate_limited' });
  if (typeof image !== 'string' || !image) return send(res, 400, { error: 'image_rejected' });
  if (image.length > MAX_B64) return send(res, 413, { error: 'too_large' });
  if (!TYPES.includes(mediaType)) return send(res, 400, { error: 'image_rejected' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: buildPrompt(String(memo).slice(0, 1000)) },
          ],
        }],
      }),
    });
    const body = await r.json();
    if (!r.ok) {
      console.error('anthropic error', r.status, JSON.stringify(body));
      return send(res, r.status === 429 ? 429 : 502, { error: r.status === 429 ? 'rate_limited' : 'upstream_error' });
    }
    const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const data = extractJson(text);
    if (!data) return send(res, 502, { error: 'invalid_json' });
    // The photo is not stored anywhere: it only passes through this request.
    return send(res, 200, { data });
  } catch (e) {
    console.error('analyze failed:', e && e.name, e && e.message);
    return send(res, e && e.name === 'TimeoutError' ? 504 : 502, { error: 'upstream_error' });
  }
}

// ---- local dev only (--static): what Nginx does on EC2 ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  if (pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('OK'); }
  const pub = path.join(ROOT, 'public');
  let file = path.normalize(path.join(pub, decodeURIComponent(pathname)));
  if (!file.startsWith(pub)) { res.writeHead(403); return res.end(); }
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not Found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const { pathname } = new URL(req.url, 'http://localhost');
  res.on('finish', () => console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - t0}ms ip=${clientIp(req)}`));
  try {
    if (pathname === '/api/analyze') return await analyze(req, res);
    if (pathname === '/api/health') return send(res, 200, { ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
    if (SERVE_STATIC && !pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`net-solver API listening on http://${HOST}:${PORT} (model ${MODEL}, .env ${envLoaded ? 'loaded' : 'not found'}, key ${process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'}${SERVE_STATIC ? ', serving public/ + /health' : ''})`);
});

// systemd / docker stop send SIGTERM: finish in-flight requests, then exit.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
