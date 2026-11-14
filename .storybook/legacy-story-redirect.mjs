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

export const LEGACY_STORY_IDS_FILE = fileURLToPath(new URL('./legacy-story-ids.mjs', import.meta.url));

/**
 * The source without its comments, which are for the people reading the file, not for every page that
 * carries it: whole-line `//` comments and block comments that start a line (`/*`, `/**`), up to the line
 * that closes them. Code lines never start with `//` or `/*` in that file; a comment written after code on
 * the same line would stay, and the unit test that parses the inlined script for comments would catch it.
 */
export function stripComments(source) {
  const kept = [];
  let inBlock = false;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      inBlock = !trimmed.includes('*/', 2);
      continue;
    }
    if (trimmed.startsWith('//') || trimmed === '') continue;
    kept.push(line);
  }
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
