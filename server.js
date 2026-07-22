import express from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { once } from 'events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3131;

app.use(express.raw({ type: '*/*', limit: '100mb' }));

const DOWNLOAD_CHUNK_SIZE = 64 * 1024;
const DEFAULT_DOWNLOAD_BYTES = 8 * 1024 * 1024;

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/* ── Network info ── */
async function getPublicIP() {
  try { const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) }); const d = await r.json(); return d.ip; }
  catch { return null; }
}
async function getIPInfo(ip) {
  if (!ip) return { isp: null, org: null, location: null };
  try { const r = await fetch(`https://ipinfo.io/${ip}/json`, { signal: AbortSignal.timeout(5000) }); const d = await r.json(); return { isp: d.org || null, org: d.org || null, location: [d.city, d.region, d.country].filter(Boolean).join(', ') || null }; }
  catch { return { isp: null, org: null, location: null }; }
}
app.get('/api/info', async (req, res) => {
  const ip = await getPublicIP();
  const info = await getIPInfo(ip);
  res.json({ ip, isp: info.isp, org: info.org, location: info.location, server: 'Cloudflare edge network', port: PORT });
});

app.get('/api/ping', (_req, res) => res.json({ ok: true, server: 'nPerf' }));

app.get('/api/download', async (req, res) => {
  const totalBytes = parseBoundedInteger(req.query.bytes, DEFAULT_DOWNLOAD_BYTES, 1, 64 * 1024 * 1024);
  const chunk = Buffer.alloc(Math.min(DOWNLOAD_CHUNK_SIZE, totalBytes));
  let remaining = totalBytes;

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Connection: 'keep-alive',
    'Transfer-Encoding': 'chunked',
  });

  while (remaining > 0 && !res.writableEnded) {
    const size = Math.min(chunk.length, remaining);
    const piece = size === chunk.length ? chunk : chunk.subarray(0, size);
    if (!res.write(piece)) await once(res, 'drain');
    remaining -= size;
  }

  res.end();
});

app.post('/api/upload', (req, res) => {
  const size = req.body?.length || 0;
  res.json({ size });
});

/* ── Serve built client ── */
const distPath = join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  try { res.send(readFileSync(join(distPath, 'index.html'), 'utf-8')); }
  catch { res.status(200).json({ status: 'dev-mode', api: 'running on :3131', vite: 'http://localhost:5173' }); }
});

app.listen(PORT, () => console.log(`NetSpeed on http://localhost:${PORT}`));
