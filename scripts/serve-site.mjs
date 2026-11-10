#!/usr/bin/env node
// Serves the assembled `site/` under the Pages prefix (`/react-object-page/`), like the live site:
// the same prefix matters because the redirects and the Storybook's relative links must work under it.
// Used by the pre-deploy smoke (playwright.site.config.ts) and for the manual check of the ticket.
// Like Pages: a missing path gets `404.html` with status 404; a directory gets its `index.html`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_BASE, SITE_PORT } from './site-config.mjs';

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

async function resolveFile(pathname) {
  if (!pathname.startsWith(SITE_BASE)) return null;
  const relative = decodeURIComponent(pathname.slice(SITE_BASE.length));
  let file = path.join(SITE_DIR, relative);
  if (file !== SITE_DIR && !file.startsWith(SITE_DIR + path.sep)) return null;
  try {
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) return null;
      file = path.join(file, 'index.html');
    }
    return { file, status: 200 };
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const hit = (await resolveFile(pathname)) ?? { file: path.join(SITE_DIR, '404.html'), status: 404 };
  try {
    const body = await readFile(hit.file);
    res.writeHead(hit.status, {
      'content-type': TYPES[path.extname(hit.file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(SITE_PORT, () => {
  console.log(`Serving ${SITE_DIR} at http://localhost:${SITE_PORT}${SITE_BASE}`);
});
