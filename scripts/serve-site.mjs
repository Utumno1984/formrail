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
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(SITE_BASE.length));
  } catch {
    return null; // malformed percent-encoding: a 404 for that request, never a crash of the server
  }
  let file = path.join(SITE_DIR, relative);
  if (file !== SITE_DIR && !file.startsWith(SITE_DIR + path.sep)) return null;
  try {
    if ((await stat(file)).isDirectory()) {
      // Like Pages: a directory without the trailing slash gets a 301 to the slashed URL (the
      // relative links of the Storybook only resolve correctly from there).
      if (!pathname.endsWith('/')) return { redirect: `${pathname}/` };
      file = path.join(file, 'index.html');
    }
    return { file, status: 200 };
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const { pathname, search } = new URL(req.url ?? '/', 'http://localhost');
  const found = await resolveFile(pathname);
  if (found?.redirect) {
    res.writeHead(301, { location: found.redirect + search, 'cache-control': 'no-store' }).end();
    return;
  }
  const hit = found ?? { file: path.join(SITE_DIR, '404.html'), status: 404 };
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
