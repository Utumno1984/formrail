#!/usr/bin/env node
// Assembles the folder published on GitHub Pages (ticket #380):
//
//   site/
//     index.html                the landing page (ticket #382); it also forwards old Storybook links to storybook/
//     landing.css, copy.js, favicon.svg   the landing's own assets (copy.js: optional "Copy command" button)
//     tokens.css                the design tokens of the published theme, as plain :root variables
//     iframe.html               redirects old story-renderer links to storybook/iframe.html
//     404.html                  static, no script (cannot loop)
//     .nojekyll                 Pages must not run Jekyll over Storybook's underscore-prefixed files
//     storybook/                the Free Storybook (storybook-static/)
//     pro/                      the Pro demo Storybook (storybook-static-pro/, ticket #381)
//
// Usage: node scripts/assemble-site.mjs   (after `npm run build`, `npm run build-storybook` and
// `npm run build-storybook:pro`)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EARLY_ACCESS_URL, SITE_BASE } from './site-config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = '/*REDIRECT_FN*/';
const CTA_BLOCK = /[ \t]*<!--EARLY_ACCESS_START-->[\s\S]*?<!--EARLY_ACCESS_END-->[ \t]*\r?\n?/;
// The same file build-css.mjs copies, as is, to dist/theme.css (the published `theme.css`).
const THEME_CSS = path.join(REPO_ROOT, 'packages', 'core', 'src', 'styles', 'tokens.css');
const FAVICON = path.join(REPO_ROOT, '.storybook', 'public', 'favicon.svg');

/**
 * The tokens of the published theme as plain CSS custom properties on `:root`. `theme.css` is Tailwind
 * syntax: a browser ignores `@theme static { … }`, so the declarations of that block are re-emitted
 * under `:root`. Nested at-rules inside the block (the keyframes) are not tokens and are dropped.
 */
export function themeTokensToRoot(themeCss) {
  const css = themeCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = css.indexOf('@theme static');
  if (start === -1) throw new Error('No "@theme static" block in the theme CSS.');
  let depth = 0;
  let chunk = '';
  const declarations = [];
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      depth++;
      chunk = '';
    } else if (ch === '}') {
      depth--;
      chunk = '';
      if (depth === 0) break;
    } else if (depth === 1) {
      if (ch === ';') {
        declarations.push(chunk.trim());
        chunk = '';
      } else chunk += ch;
    }
  }
  const tokens = declarations.filter((d) => d.startsWith('--'));
  if (tokens.length === 0) throw new Error('The "@theme static" block has no token.');
  return `:root {\n${tokens.map((d) => `  ${d.replace(/\s+/g, ' ')};`).join('\n')}\n}\n`;
}

/**
 * The landing's call-to-action: kept (with the URL written in) when `earlyAccessUrl` is set, removed
 * from the page altogether when it is empty. Never a link without a target.
 */
export function renderEarlyAccess(html, earlyAccessUrl) {
  if (!CTA_BLOCK.test(html)) throw new Error('index.html has no EARLY_ACCESS_START/END block.');
  if (earlyAccessUrl === '') return html.replace(CTA_BLOCK, '');
  let url;
  try {
    url = new URL(earlyAccessUrl);
  } catch {
    throw new Error(`EARLY_ACCESS_URL is not an absolute URL: ${earlyAccessUrl}`);
  }
  if (url.protocol !== 'https:') throw new Error('EARLY_ACCESS_URL must be an https:// URL.');
  const attr = url.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return html.replace(/<!--EARLY_ACCESS_(START|END)-->[ \t]*\r?\n?/g, '').replace('{{EARLY_ACCESS_URL}}', () => attr);
}

/** The source of `site-root/redirect.mjs` as plain script code: `export` stripped, ready to inline. */
export function redirectScriptSource(siteRootDir) {
  const source = readFileSync(path.join(siteRootDir, 'redirect.mjs'), 'utf8');
  return source.replace(/^export\s+/gm, '').trim();
}

/**
 * @param {object} [options]
 * @param {string} [options.storybookDir] the built Storybook (default `<repo>/storybook-static`)
 * @param {string | null} [options.proStorybookDir] the built Pro demo Storybook; when given it must exist
 *   (the CLI passes `<repo>/storybook-static-pro`). Omitted: `pro/` is created empty.
 * @param {string} [options.siteRootDir] the static root files (default `<repo>/site-root`)
 * @param {string} [options.outDir] where to write the site (default `<repo>/site`); emptied first
 * @param {string} [options.siteBase] path prefix, written into 404.html (default `SITE_BASE`)
 * @param {string} [options.earlyAccessUrl] target of the landing's CTA; empty = no CTA (default `EARLY_ACCESS_URL`)
 * @param {string} [options.themeCssPath] the theme source whose tokens become `tokens.css`
 * @param {string} [options.faviconPath] the favicon copied to `favicon.svg`
 * @returns {string} outDir
 */
export function assembleSite({
  storybookDir = path.join(REPO_ROOT, 'storybook-static'),
  proStorybookDir = null,
  siteRootDir = path.join(REPO_ROOT, 'site-root'),
  outDir = path.join(REPO_ROOT, 'site'),
  siteBase = SITE_BASE,
  earlyAccessUrl = EARLY_ACCESS_URL,
  themeCssPath = THEME_CSS,
  faviconPath = FAVICON,
} = {}) {
  if (!existsSync(path.join(storybookDir, 'index.html'))) {
    throw new Error(`No built Storybook at ${storybookDir}: run \`npm run build-storybook\` first.`);
  }
  if (proStorybookDir !== null && !existsSync(path.join(proStorybookDir, 'index.html'))) {
    throw new Error(`No built Pro Storybook at ${proStorybookDir}: run \`npm run build-storybook:pro\` first.`);
  }
  // Everything that can fail is read or validated before the output folder is touched: after the
  // rmSync below nothing may throw for a missing/malformed source, or a failed run would leave
  // neither the previous (working) site nor a new one.
  const tokens = themeTokensToRoot(readFileSync(themeCssPath, 'utf8'));
  const landing = renderEarlyAccess(readFileSync(path.join(siteRootDir, 'index.html'), 'utf8'), earlyAccessUrl);
  const redirect = redirectScriptSource(siteRootDir);
  const pages = {};
  for (const file of ['index.html', 'iframe.html']) {
    const html = file === 'index.html' ? landing : readFileSync(path.join(siteRootDir, file), 'utf8');
    if (!html.includes(PLACEHOLDER)) throw new Error(`${file} has no ${PLACEHOLDER} placeholder.`);
    // A function replacer: `$` sequences in the code must not be read as replacement patterns.
    pages[file] = html.replace(PLACEHOLDER, () => redirect);
  }
  const notFound = readFileSync(path.join(siteRootDir, '404.html'), 'utf8').replaceAll('{{SITE_BASE}}', siteBase);
  const assets = ['landing.css', 'copy.js'].map((file) => path.join(siteRootDir, file));
  for (const asset of [...assets, faviconPath]) {
    if (!existsSync(asset)) throw new Error(`Missing site asset (favicon/landing file): ${asset}`);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  cpSync(storybookDir, path.join(outDir, 'storybook'), { recursive: true });
  if (proStorybookDir === null) mkdirSync(path.join(outDir, 'pro'));
  else cpSync(proStorybookDir, path.join(outDir, 'pro'), { recursive: true });
  writeFileSync(path.join(outDir, '.nojekyll'), '');
  writeFileSync(path.join(outDir, 'tokens.css'), tokens);
  for (const asset of assets) cpSync(asset, path.join(outDir, path.basename(asset)));
  cpSync(faviconPath, path.join(outDir, 'favicon.svg'));
  for (const [file, html] of Object.entries(pages)) writeFileSync(path.join(outDir, file), html);
  writeFileSync(path.join(outDir, '404.html'), notFound);
  return outDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Assembled the site in ${assembleSite({ proStorybookDir: path.join(REPO_ROOT, 'storybook-static-pro') })}`);
}
