#!/usr/bin/env node
// Assembles the folder published on GitHub Pages (ticket #380):
//
//   site/
//     index.html, iframe.html   root files: redirect old Storybook links to storybook/ (landing: later)
//     404.html                  static, no script (cannot loop)
//     .nojekyll                 Pages must not run Jekyll over Storybook's underscore-prefixed files
//     storybook/                the Free Storybook (storybook-static/)
//     pro/                      empty, reserved for the Pro demo (next ticket)
//
// Usage: node scripts/assemble-site.mjs   (after `npm run build` and `npm run build-storybook`)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_BASE } from './site-config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = '/*REDIRECT_FN*/';

/** The source of `site-root/redirect.mjs` as plain script code: `export` stripped, ready to inline. */
export function redirectScriptSource(siteRootDir) {
  const source = readFileSync(path.join(siteRootDir, 'redirect.mjs'), 'utf8');
  return source.replace(/^export\s+/gm, '').trim();
}

/**
 * @param {object} [options]
 * @param {string} [options.storybookDir] the built Storybook (default `<repo>/storybook-static`)
 * @param {string} [options.siteRootDir] the static root files (default `<repo>/site-root`)
 * @param {string} [options.outDir] where to write the site (default `<repo>/site`); emptied first
 * @param {string} [options.siteBase] path prefix, written into 404.html (default `SITE_BASE`)
 * @returns {string} outDir
 */
export function assembleSite({
  storybookDir = path.join(REPO_ROOT, 'storybook-static'),
  siteRootDir = path.join(REPO_ROOT, 'site-root'),
  outDir = path.join(REPO_ROOT, 'site'),
  siteBase = SITE_BASE,
} = {}) {
  if (!existsSync(path.join(storybookDir, 'index.html'))) {
    throw new Error(`No built Storybook at ${storybookDir}: run \`npm run build-storybook\` first.`);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  cpSync(storybookDir, path.join(outDir, 'storybook'), { recursive: true });
  mkdirSync(path.join(outDir, 'pro'));
  writeFileSync(path.join(outDir, '.nojekyll'), '');

  const redirect = redirectScriptSource(siteRootDir);
  for (const file of ['index.html', 'iframe.html']) {
    const html = readFileSync(path.join(siteRootDir, file), 'utf8');
    if (!html.includes(PLACEHOLDER)) throw new Error(`${file} has no ${PLACEHOLDER} placeholder.`);
    // A function replacer: `$` sequences in the code must not be read as replacement patterns.
    writeFileSync(path.join(outDir, file), html.replace(PLACEHOLDER, () => redirect));
  }
  const notFound = readFileSync(path.join(siteRootDir, '404.html'), 'utf8');
  writeFileSync(path.join(outDir, '404.html'), notFound.replaceAll('{{SITE_BASE}}', siteBase));
  return outDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Assembled the site in ${assembleSite()}`);
}
