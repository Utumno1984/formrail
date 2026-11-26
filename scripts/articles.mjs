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
//   <p>HTML body: h2/h3 headings (the page owns the h1; no level may be skipped), <pre><code> blocks, links.</p>
//
// Rules worth knowing:
// - The build day is computed in UTC (`now.toISOString()`): near midnight it can differ from the local day.
// - There is no scheduled deploy: an article dated in the future goes out with the first push to main on or
//   after that date (the deploy runs on push), not by itself on the day.
// - In `site-root/articles/` any file that is not `.html` stops the assembly (it is almost surely a mistake),
//   while files starting with a dot (`.gitkeep`, editor leftovers) are ignored.
// - Front matter values are plain text, not YAML: quotes around a value stay literal (`title: "A"` shows the quotes).
// - The body is raw HTML written by the maintainers. A few regexes catch the usual mistakes (script, h1, iframe,
//   embed, object, style, link, base, meta, form elements; inline `on...=` handlers, `javascript:` URLs, inline
//   `url()` styles, absolute or protocol-relative `src`/`srcset`/`poster` inside real tags). They are a lint, not
//   a sanitiser: HTML has too many ways to spell the same thing (entities, odd whitespace, SVG, `ping`...).
//   The real barrier is the Content-Security-Policy `<meta>` of article.html/articles.html (no script, no
//   third-party resource, no form, no base, no object); links to external pages with `<a href>` are fine.
// - Atom ids are `tag:` URIs, independent of the hosting (RFC 4287 section 4.2.6: an id must never change).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const KEYS = ['title', 'date', 'slug', 'description', 'author'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// eslint-disable-next-line no-control-regex -- the point is to reject control characters (invalid in XML 1.0)
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;
// Checked in order; the message completes "the body ...". `BODY_RULES` look at the whole body (tag names),
// `TAG_RULES` only at the real tags (attributes): in text a `<` is always written `&lt;`, so code shown inside
// `<pre><code>` (`onClick={save}`, `img.src = "https://..."`) or prose never forms a tag and is not scanned.
const BODY_RULES = [
  [/<h1[\s/>]/i, 'must not contain an h1: the page title is the only h1'],
  [/<script[\s/>]/i, 'must not contain a script: the site ships no script on articles'],
  [/<(?:iframe|embed|object|style|link|base|meta|form)[\s/>]/i, 'must not contain an iframe, embed, object, style, link, base, meta or form element'],
];
const TAG = /<[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>/g;
const TAG_RULES = [
  [/[\s/"']on[a-z]+\s*=/i, 'must not contain an inline event handler (on...=)'],
  [/javascript\s*:/i, 'must not contain a javascript: URL'],
  [/\bstyle\s*=\s*["'][^"']*url\s*\(/i, 'must not load a resource from an inline style (url())'],
  [/\b(?:src|poster)\s*=\s*["']?\s*(?:https?:|[/\\]{2})/i, 'must not load src/poster from another origin (absolute http(s): or // URL): the page makes no third-party request'],
  [/\bsrcset\s*=\s*["']?[^"'>]*?(?:https?:|[/\\]{2})/i, 'must not load srcset from another origin (absolute http(s): or // URL): the page makes no third-party request'],
];
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
  source = source.replace(/^\uFEFF/, '');
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
  if (CONTROL.test(body)) fail('the body contains a control character.');
  for (const [pattern, reason] of BODY_RULES) {
    if (pattern.test(body)) fail(`the body ${reason}.`);
  }
  const tags = [...body.matchAll(TAG)].map((m) => m[0]);
  for (const [pattern, reason] of TAG_RULES) {
    if (tags.some((tag) => pattern.test(tag))) fail(`the body ${reason}.`);
  }
  let level = 1;
  for (const m of body.matchAll(/<h([2-6])[\s/>]/gi)) {
    const next = Number(m[1]);
    if (next > level + 1) fail(`the body skips a heading level (h${next} after ${level === 1 ? 'the page title' : `h${level}`}): headings must not skip levels.`);
    level = next;
  }
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

/** Absolute URL of a site path: origin + prefix + path (`SITE_BASE`, `/` by default since the move to formrail.dev). */
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

/** Atom 1.0 feed: one entry per article, absolute links, `updated` from the article date, hosting-independent `tag:` ids. */
export function renderFeed(articles, url) {
  const stamp = (date) => `${date}T00:00:00Z`;
  const entries = articles
    .map(
      (a) => `  <entry>
    <id>tag:formrail.dev,2026:articles/${a.slug}</id>
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
  <id>tag:formrail.dev,2026:articles</id>
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
