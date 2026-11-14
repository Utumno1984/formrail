// Inlines .storybook/legacy-story-ids.mjs at the top of the manager's and of the preview's <head>
// (ticket #516), through `managerHead` / `previewHead` in main.ts, in every build (Free, Pro demo,
// complete) and in `storybook dev`.
//
// Why the head, as a classic inline script: it runs while the document is parsed, before any module
// script. The manager's router and the preview's URL store both read `location` when their module
// bundles start (the manager: `sb-manager/runtime.js`, after `manager.ts`; the preview: `vite-app.js`,
// at the end of <body>), so on a page load the URL is already the new one when Storybook first reads
// it: the manager points its preview frame straight at the new id (whose own redirect then finds
// nothing to do: a new id is never an old one, see the map tests), and there is no reload.
//
// Limit (out of the ticket's scope, which is published links, i.e. page loads): a navigation INSIDE a
// running manager does not load a page, so it does not go through this script. An MDX link
// `?path=/story/<old id>` clicked in a Docs page (Storybook's `navigateUrl`, no reload) still lands on
// "story not found", with the old id in the address bar. Links written in this repo must use current ids.
//
// Why `history.replaceState` and not `location.replace`: same document, no second load, and the old
// URL leaves no history entry (Back goes to the page before it, never to the old id).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

export const LEGACY_STORY_IDS_FILE = fileURLToPath(new URL('./legacy-story-ids.mjs', import.meta.url));

/**
 * The source without the comments that stand on their own, which are for the people reading the file, not
 * for every page that carries it. The comments come from the parser (espree, `comment: true`), by
 * position, so a string, a regex or a template containing `//` or `/*` is never touched, and code written
 * on the same line as a comment stays (`/** doc *\/ var x = 1;` gives ` var x = 1;`).
 *
 * A comment is removed when nothing but whitespace (or an already removed comment) comes before it on
 * its first line: whole-line `//` comments, block comments of any length, and the `// note` that follows
 * the closing `*\/` of a block. A comment after code (`var b = 1; // note`) stays, as it always has.
 * Lines left blank by the removal, and blank lines between statements, are dropped; the blank lines
 * inside a multi-line string or template are kept as they are. The remaining lines are not re-indented.
 *
 * @param {string} source JavaScript, parsed as an ES module (`export` is accepted)
 * @returns {string}
 * @throws {Error} when the source does not parse: nothing is stripped on a guess
 */
export function stripComments(source) {
  let parsed;
  try {
    parsed = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', comment: true, tokens: true, range: true, loc: true });
  } catch (cause) {
    throw new Error(`stripComments: the source does not parse (${cause instanceof Error ? cause.message : cause}), refusing to guess where the comments are.`, { cause });
  }
  const removed = new Array(source.length).fill(false);
  for (const comment of parsed.comments) {
    const [start, end] = comment.range;
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    let before = '';
    for (let i = lineStart; i < start; i++) if (!removed[i]) before += source[i];
    if (before.trim() !== '') continue;
    removed.fill(true, start, end);
  }
  // Lines that continue a multi-line string or template are content, not layout.
  const literalLines = new Set();
  for (const token of parsed.tokens) {
    if (token.loc.end.line > token.loc.start.line) for (let n = token.loc.start.line + 1; n <= token.loc.end.line; n++) literalLines.add(n);
  }
  const kept = [];
  let offset = 0;
  source.split('\n').forEach((line, index) => {
    let text = '';
    for (let i = 0; i < line.length; i++) if (!removed[offset + i]) text += line[i];
    offset += line.length + 1;
    if (text.trim() === '' && !literalLines.has(index + 1)) return;
    kept.push(text);
  });
  return kept.join('\n');
}

/**
 * The `<script>` element that applies the map, built from the source of legacy-story-ids.mjs: `export`
 * stripped, comments stripped, wrapped in a function so that nothing leaks into the page's globals. A
 * failure of the redirect is logged and never stops Storybook from loading the URL as it is.
 *
 * @param {string} source the content of legacy-story-ids.mjs
 * @returns {string}
 */
export function legacyRedirectScript(source) {
  if (!/^export function resolveLegacyStory\(/m.test(source)) {
    throw new Error('legacy-story-ids.mjs does not export resolveLegacyStory: nothing to inline.');
  }
  // `</script` (any case) would close the element early; `<!--` would switch the parser's script state.
  if (/<\/script|<!--/i.test(source)) {
    throw new Error('legacy-story-ids.mjs contains "</script" or "<!--": it cannot be inlined in a <script>.');
  }
  const body = stripComments(source.replace(/^export\s+/gm, '')).trim();
  return [
    '<script>',
    '(function () {',
    body,
    'try {',
    '  var target = resolveLegacyStory(location.href);',
    "  if (target) history.replaceState(history.state, '', target);",
    '} catch (e) {',
    "  if (typeof console !== 'undefined') console.error('[formrail] legacy story id redirect failed', e);",
    '}',
    '})();',
    '</script>',
  ].join('\n');
}

/** `managerHead` / `previewHead` of main.ts: the redirect first, then whatever head Storybook built. */
export function withLegacyRedirect(head = '', source = readFileSync(LEGACY_STORY_IDS_FILE, 'utf8')) {
  return `${legacyRedirectScript(source)}\n${head}`;
}
