// Static technical articles of the site (ticket #698): `site-root/articles/<anything>.html` files, each an HTML
// fragment with a minimal front matter, become `articles/` (index), `articles/<slug>/` and `articles/feed.xml`.
// Adding an article means adding a file: the assembler is not touched. No dependency, no script in the output.
//
// File format:
//   ---
//   title: Plain text, escaped by the generator
//   date: 2026-12-01            (YYYY-MM-DD; a date after the build day is not published yet)
//   slug: lowercase-with-dashes (unique; becomes the URL)
//   description: One plain-text sentence (meta description, index, feed summary)
//   author: Plain text
//   ---
//   <p>HTML body: h2/h3 headings (the page owns the h1), <pre><code> blocks, links.</p>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const KEYS = ['title', 'date', 'slug', 'description', 'author'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// eslint-disable-next-line no-control-regex -- the point is to reject control characters (invalid in XML 1.0)
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** HTML/XML text and attribute escaping (the same rule serves both, quotes included). */
export function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** "2026-11-26" -> "26 November 2026" (locale independent). */
export function formatDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Parses one source file. Every problem is an Error whose message starts with the file name.
 * @param {string} file name used in messages
 * @param {string} source
 */
export function parseArticle(file, source) {
  const fail = (message) => {
    throw new Error(`${file}: ${message}`);
  };
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) fail('missing front matter (the file must start with a "---" block).');
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const m = /^([a-z]+):[ \t]*(.*)$/.exec(line);
    if (!m) fail(`malformed front matter line: "${line}".`);
    if (!KEYS.includes(m[1])) fail(`unknown front matter key "${m[1]}" (allowed: ${KEYS.join(', ')}).`);
    if (m[1] in meta) fail(`duplicate front matter key "${m[1]}".`);
    meta[m[1]] = m[2].trim();
  }
  for (const key of KEYS) {
    if (!meta[key]) fail(`missing or empty "${key}" in the front matter.`);
    if (CONTROL.test(meta[key])) fail(`"${key}" contains a control character.`);
  }
  if (!isRealDate(meta.date)) fail(`"date" must be a real YYYY-MM-DD date, got "${meta.date}".`);
  if (!SLUG.test(meta.slug)) fail(`"slug" must be lowercase letters, digits and single dashes, got "${meta.slug}".`);
  const body = match[2].trim();
  if (body === '') fail('the article has no body.');
  if (/<h1[\s>]/i.test(body)) fail('the body must not contain an h1: the page title is the only h1.');
  if (/<script[\s>]/i.test(body)) fail('the body must not contain a script: the site ships no script on articles.');
  if (CONTROL.test(body)) fail('the body contains a control character.');
  return { ...meta, body };
}

/**
 * Reads `dir` and returns the articles to publish (newest first) and the scheduled ones (date after `now`).
 * A missing folder is no articles. Throws on any malformed file or duplicate slug.
 * @param {string} dir
 * @param {{ now?: Date }} [options]
 */
export function loadArticles(dir, { now = new Date() } = {}) {
  if (!existsSync(dir)) return { published: [], scheduled: [] };
  const today = now.toISOString().slice(0, 10);
  const all = [];
  const seen = new Map();
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const file = `articles/${name}`;
    if (!name.endsWith('.html')) throw new Error(`${file}: only .html article sources are allowed.`);
    const article = { ...parseArticle(file, readFileSync(path.join(dir, name), 'utf8')), file };
    if (seen.has(article.slug)) throw new Error(`${file}: duplicate slug "${article.slug}" (also used by ${seen.get(article.slug)}).`);
    seen.set(article.slug, file);
    all.push(article);
  }
  const byNewest = (a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : a.date < b.date ? 1 : -1);
  return {
    published: all.filter((a) => a.date <= today).sort(byNewest),
    scheduled: all.filter((a) => a.date > today).sort(byNewest),
  };
}

/** Single-pass `{{NAME}}` substitution: a value is never scanned again, so it cannot inject a placeholder. */
function fill(template, values, name) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key) => {
    if (!(key in values)) throw new Error(`${name}: unknown placeholder ${whole}.`);
    return values[key];
  });
}

/** The `<pre>` blocks are keyboard-scrollable (a scrollable region must be focusable). */
function focusablePre(body) {
  return body.replace(/<pre(?![^>]*\btabindex\b)([^>]*)>/gi, '<pre tabindex="0"$1>');
}

/** Absolute URL of a site path: origin + prefix + path (`SITE_BASE` today, `/` once the domain moves, #667). */
export function absoluteUrl(origin, siteBase, relativePath) {
  return `${origin.replace(/\/+$/, '')}${siteBase}${relativePath}`;
}

/**
 * The generated files, as { 'articles/index.html': html, ... } (paths relative to the site root).
 * @param {Array} articles published articles, newest first (at least one)
 * @param {{ indexTemplate: string, articleTemplate: string, origin: string, siteBase: string }} options
 */
export function renderArticles(articles, { indexTemplate, articleTemplate, origin, siteBase }) {
  const url = (rel) => absoluteUrl(origin, siteBase, rel);
  const files = {};
  const items = articles
    .map(
      (a) => `            <li class="article-item">
              <h2><a href="${a.slug}/">${escapeText(a.title)}</a></h2>
              <p class="muted"><time datetime="${a.date}">${formatDate(a.date)}</time> · ${escapeText(a.author)}</p>
              <p>${escapeText(a.description)}</p>
            </li>`,
    )
    .join('\n');
  files['articles/index.html'] = fill(
    indexTemplate,
    { ITEMS: items, CANONICAL: escapeText(url('articles/')), FEED_URL: escapeText(url('articles/feed.xml')) },
    'articles.html',
  );
  for (const a of articles) {
    files[`articles/${a.slug}/index.html`] = fill(
      articleTemplate,
      {
        TITLE: escapeText(a.title),
        DESCRIPTION: escapeText(a.description),
        AUTHOR: escapeText(a.author),
        DATE: a.date,
        DATE_TEXT: formatDate(a.date),
        CANONICAL: escapeText(url(`articles/${a.slug}/`)),
        FEED_URL: escapeText(url('articles/feed.xml')),
        BODY: focusablePre(a.body),
      },
      'article.html',
    );
  }
  files['articles/feed.xml'] = renderFeed(articles, url);
  return files;
}

/** Atom 1.0 feed: one entry per article, absolute links, `updated` from the article date. */
export function renderFeed(articles, url) {
  const stamp = (date) => `${date}T00:00:00Z`;
  const entries = articles
    .map(
      (a) => `  <entry>
    <id>${escapeText(url(`articles/${a.slug}/`))}</id>
    <title>${escapeText(a.title)}</title>
    <link rel="alternate" type="text/html" href="${escapeText(url(`articles/${a.slug}/`))}"/>
    <updated>${stamp(a.date)}</updated>
    <published>${stamp(a.date)}</published>
    <author><name>${escapeText(a.author)}</name></author>
    <summary>${escapeText(a.description)}</summary>
  </entry>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escapeText(url('articles/'))}</id>
  <title>Formrail articles</title>
  <subtitle>Technical articles about record-editing screens in React.</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeText(url('articles/feed.xml'))}"/>
  <link rel="alternate" type="text/html" href="${escapeText(url('articles/'))}"/>
  <updated>${stamp(articles[0].date)}</updated>
${entries}
</feed>
`;
}

const ARTICLES_BLOCK = /[ \t]*<!--ARTICLES_START-->[\s\S]*?<!--ARTICLES_END-->[ \t]*\r?\n?/g;

/** The "Articles" links of the shared nav/footer: kept when there is at least one article, removed otherwise. */
export function renderArticlesLinks(html, hasArticles) {
  return hasArticles ? html.replace(/<!--ARTICLES_(?:START|END)-->/g, '') : html.replace(ARTICLES_BLOCK, '');
}
