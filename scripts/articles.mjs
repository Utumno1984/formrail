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
// - The body is raw HTML written by the maintainers. It is checked as a content lint with parse5, the reference
//   implementation of the WHATWG HTML parser (the algorithm browsers use): the rules look at the elements and
//   attributes the parser really builds, with entities already decoded, never at the spelling of the source. So
//   code shown escaped in `<pre><code>` (`&lt;b onclick&gt;`) is text and passes, while an odd but valid spelling
//   (unquoted values with quotes inside, `jav&#x61;script:`, a tab inside a URL, a tag missing its last `>`) is
//   seen exactly as a browser sees it. Refused: script, h1, iframe, embed, object, style, link, base, meta and
//   form elements; `on...` handler attributes; `javascript:` URLs; every `style` attribute (the page CSP blocks
//   inline styles); `ping`; `src`/`srcset`/`poster`/`background` from another origin; in SVG an `href` to another
//   origin (image, use...), an external `url()` or an animated `href`; a body that ends inside a quote or a comment.
//   It stays a lint, not a sanitiser: it cannot know every way a browser may fetch something (CSS escapes in an
//   SVG presentation attribute, for one). The real barrier is the Content-Security-Policy `<meta>` of
//   article.html/articles.html (no script, no inline style, no third-party resource, no form, no base, no
//   object); links to external pages with `<a href>` are fine.
// - Atom ids are `tag:` URIs, independent of the hosting (RFC 4287 section 4.2.6: an id must never change).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'parse5';

const KEYS = ['title', 'date', 'slug', 'description', 'author'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// eslint-disable-next-line no-control-regex -- the point is to reject control characters (invalid in XML 1.0)
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;
// The body is parsed where article.html puts it: in main > article > div, after the page h1 and the meta line
// (a test keeps the two in step).
// A whole document, not a fragment, because a `<body ...>` or `<html ...>` tag in the body adds its attributes
// to the page's own body/html element: a fragment parse drops them, a browser does not.
export const BEFORE_BODY = '<!DOCTYPE html><html><head></head><body><main><article><div><h1>t</h1><p>m</p>';
// In the page the template goes on after the body ("\n        </div>"): a last tag that lacks only its `>` is
// still closed there, by that whitespace and the next `>`. Appending both shows that tag to the rules here too;
// a body that ends inside a quoted value or a comment stays unfinished and is refused (`UNFINISHED`).
const AFTER_BODY = '\n>';
const UNFINISHED = new Set(['eof-in-tag', 'eof-in-comment', 'eof-in-doctype', 'eof-in-cdata']);
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
const OTHER_BANNED = new Set(['iframe', 'embed', 'object', 'style', 'link', 'base', 'meta', 'form']);
// Attributes whose value a browser follows as a URL (navigation, submission or fetch): `javascript:` is refused there.
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'data', 'poster', 'background', 'cite', 'longdesc', 'lowsrc', 'dynsrc', 'codebase', 'classid', 'archive', 'manifest', 'icon', 'usemap', 'profile']);
const SVG_ANIMATIONS = new Set(['animate', 'set', 'animatemotion', 'animatetransform', 'animatecolor']);
const THIRD_PARTY = 'from another origin (absolute http(s): or // URL): the page makes no third-party request';

/** A URL attribute value as the URL parser reads it: tabs and newlines removed, leading/trailing C0 and spaces trimmed. */
function urlOf(value) {
  // eslint-disable-next-line no-control-regex -- the URL parser strips C0 controls and spaces at both ends
  return value.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
}
// Spaces before the colon are refused too: a browser reads `javascript :x` as a relative path, but it is surely meant as one.
const isJavascriptUrl = (value) => /^javascript\s*:/i.test(urlOf(value));
// `\` counts as `/` in http(s) URLs, so `/\host`, `\\host` and `\/host` are protocol-relative like `//host`.
const isExternal = (value) => /^(?:https?:|[/\\]{2})/i.test(urlOf(value));
// srcset: candidates are separated by commas, URL and descriptors by ASCII whitespace; every piece is checked
// (a descriptor never starts with http: or //, so checking it too only errs on the strict side).
const hasExternalCandidate = (value) => value.split(/[\t\n\f\r ,]+/).some(isExternal);
const hasExternalCssUrl = (value) => /url\s*\(\s*["']?\s*(?:https?:|[/\\]{2})/i.test(value.replace(/[\t\n\r]/g, ''));
const has = (el, test) => el.attrs.some(test);

// Checked in order over every element; the message completes "the body ...". `fromBody` is false for the page
// elements of BEFORE_BODY: only their attributes come from the article (merged by a `<body>`/`<html>` tag).
const RULES = [
  [(el) => el.fromBody && el.name === 'h1', 'must not contain an h1: the page title is the only h1'],
  [(el) => el.fromBody && el.name === 'script', 'must not contain a script: the site ships no script on articles'],
  [(el) => el.fromBody && OTHER_BANNED.has(el.name), 'must not contain an iframe, embed, object, style, link, base, meta or form element'],
  [(el) => has(el, (a) => a.name.startsWith('on')), 'must not contain an inline event handler (on...=)'],
  [(el) => has(el, (a) => URL_ATTRIBUTES.has(a.local) && isJavascriptUrl(a.value)), 'must not contain a javascript: URL'],
  [(el) => has(el, (a) => a.name === 'style'), 'must not contain a style attribute: inline styles are blocked by the page CSP, use a class'],
  [(el) => has(el, (a) => (a.name === 'src' || a.name === 'poster') && isExternal(a.value)), `must not load src/poster ${THIRD_PARTY}`],
  [(el) => has(el, (a) => a.name === 'srcset' && hasExternalCandidate(a.value)), `must not load srcset ${THIRD_PARTY}`],
  [(el) => has(el, (a) => a.name === 'background' && isExternal(a.value)), `must not load background ${THIRD_PARTY}`],
  [(el) => has(el, (a) => a.name === 'ping'), 'must not contain a ping attribute: a click on the link would notify another address'],
  [(el) => el.ns === SVG_NS && el.name !== 'a' && has(el, (a) => a.local === 'href' && isExternal(a.value)), `must not load an SVG href (image, use...) ${THIRD_PARTY}`],
  [(el) => el.ns === SVG_NS && has(el, (a) => hasExternalCssUrl(a.value)), `must not load an SVG url() ${THIRD_PARTY}`],
  [
    (el) => el.ns === SVG_NS && SVG_ANIMATIONS.has(el.name) && has(el, (a) => a.name === 'attributename' && a.value.trim().toLowerCase().replace(/^.*:/, '') === 'href'),
    'must not animate an SVG href: the animated value would escape the URL checks',
  ],
];

/** The elements of a parse5 tree in document order, template contents included (iterative: no recursion limit). */
function elementsOf(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.tagName) out.push(node);
    const next = node.content ? [...node.childNodes, node.content] : (node.childNodes ?? []);
    for (let i = next.length - 1; i >= 0; i--) stack.push(next[i]);
  }
  return out;
}

/**
 * The reason the body is refused when parsed with scripting on or off (a `<noscript>` is text in one mode and
 * markup in the other, and a browser may run either), or null.
 */
function bodyProblem(body, scriptingEnabled) {
  const errors = [];
  const document = parse(`${BEFORE_BODY}${body}${AFTER_BODY}`, {
    scriptingEnabled,
    sourceCodeLocationInfo: true,
    onParseError: (error) => errors.push(error.code),
  });
  const elements = elementsOf(document).map((node) => ({
    name: node.tagName.toLowerCase(),
    ns: node.namespaceURI,
    // Elements the parser creates on its own (`tbody`...) have no location: they come from the body too.
    fromBody: !(node.sourceCodeLocation?.startOffset < BEFORE_BODY.length),
    attrs: node.attrs.map((a) => {
      const name = a.name.toLowerCase();
      return { name, local: name.slice(name.lastIndexOf(':') + 1), value: a.value };
    }),
  }));
  for (const [test, reason] of RULES) {
    if (elements.some(test)) return reason;
  }
  let level = 1;
  for (const el of elements) {
    const m = el.fromBody && el.ns === HTML_NS ? /^h([2-6])$/.exec(el.name) : null;
    if (!m) continue;
    const next = Number(m[1]);
    if (next > level + 1) return `skips a heading level (h${next} after ${level === 1 ? 'the page title' : `h${level}`}): headings must not skip levels`;
    level = next;
  }
  if (errors.some((code) => UNFINISHED.has(code))) {
    return 'ends inside an unfinished tag or comment (an unclosed quote or <!--): the page after it would become part of it';
  }
  return null;
}

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
  const problem = bodyProblem(body, true) ?? bodyProblem(body, false);
  if (problem) fail(`the body ${problem}.`);
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
