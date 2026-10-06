#!/usr/bin/env node
/**
 * Local authoring loop: `npm run dev` (optionally PORT=5000).
 * Rebuilds on any change under content/, static/, build/ or site.config.ts,
 * serves dist/ on localhost, and reloads open tabs when a build succeeds.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { paths } from './content.ts';

const port = Number(process.env.PORT ?? 4000);
const origin = `http://localhost:${port}`;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
};

const RELOAD_SNIPPET =
  '<script>(()=>{const s=new EventSource("/__reload");s.onmessage=()=>location.reload();})()</script>';

// ---- build runner ---------------------------------------------------------

let building = false;
let queued = false;

function runBuild(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(import.meta.dirname, 'build.ts'), '--drafts'], {
      stdio: 'inherit',
      env: { ...process.env, SITE_URL: origin },
    });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function rebuild(reason: string): Promise<void> {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  console.log(`\n[dev] ${reason}`);
  const ok = await runBuild();
  building = false;
  if (ok) broadcastReload();
  else console.log('[dev] build failed; waiting for changes');
  if (queued) {
    queued = false;
    void rebuild('changes queued during build');
  }
}

// ---- watcher --------------------------------------------------------------

let timer: NodeJS.Timeout | null = null;
function scheduleRebuild(file: string): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void rebuild(`changed: ${file}`), 150);
}

function watch(target: string, recursive: boolean): void {
  if (!fs.existsSync(target)) return;
  fs.watch(target, { recursive }, (_event, filename) => {
    const name = filename ? String(filename) : path.basename(target);
    if (name.startsWith('.') || name.includes('~')) return;
    scheduleRebuild(path.join(path.relative(paths.root, target), name));
  });
}

// ---- server ---------------------------------------------------------------

const clients = new Set<http.ServerResponse>();
function broadcastReload(): void {
  for (const res of clients) res.write('data: reload\n\n');
}

function resolveFile(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  } catch {
    return null;
  }
  const normalised = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let candidate = path.join(paths.dist, normalised);
  if (!candidate.startsWith(paths.dist)) return null;

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    candidate = path.join(candidate, 'index.html');
  } else if (!fs.existsSync(candidate) && !path.extname(candidate)) {
    candidate = path.join(candidate, 'index.html');
  }
  return fs.existsSync(candidate) ? candidate : null;
}

function serveHtml(res: http.ServerResponse, file: string, status: number): void {
  const html = fs.readFileSync(file, 'utf8');
  const injected = html.includes('</body>') ? html.replace('</body>', `${RELOAD_SNIPPET}</body>`) : html + RELOAD_SNIPPET;
  res.writeHead(status, { 'content-type': MIME['.html']!, 'cache-control': 'no-store' });
  res.end(injected);
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  if (url === '/__reload') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const file = resolveFile(url);
  if (!file) {
    const notFound = path.join(paths.dist, '404.html');
    if (fs.existsSync(notFound)) return serveHtml(res, notFound, 404);
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }

  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return serveHtml(res, file, 200);

  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

// ---- go -------------------------------------------------------------------

await rebuild('initial build');
watch(paths.content, true);
watch(paths.static, true);
watch(path.join(paths.root, 'build'), true);
watch(path.join(paths.root, 'site.config.ts'), false);

server.listen(port, () => {
  console.log(`\n[dev] serving ${path.relative(paths.root, paths.dist)}/ at ${origin}  (drafts visible, live reload on)`);
});
