// Redirects of renamed story ids (ticket #516). Storybook derives an id from the title and the story
// name, so a rename turns every published link (`?path=/docs/<old>--docs`, `iframe.html?id=<old>`, links
// in issues, posts, the landing) into "story not found", and Storybook has no aliases of its own.
//
// Renaming a public story or a title: add `'<old id>': '<new id>'` here in the same PR, for every id
// that changes, the Docs page (`--docs`) included. scripts/legacy-story-ids.test.mjs rejects a cycle, a
// chain (an old id pointing at another old id: fold it into one hop) and a malformed id;
// e2e/legacy-story-ids.spec.ts and e2e/site/legacy-story-ids.spec.ts reject an old id that still exists
// in a build (it would hide a real story) and a new id that exists in neither the Free nor the Pro build.
//
// This file is the single source of truth: .storybook/legacy-story-redirect.mjs inlines its source at the
// top of the manager's and of the preview's <head> (Free, Pro demo and complete builds alike), and the
// unit tests import it directly. Keep it free of imports and of anything but ES5-level syntax besides
// `export` (which the inliner strips), like site-root/redirect.mjs.

/** Old story/Docs id -> the id that replaced it. One hop only: a value is never a key. */
export var LEGACY_STORY_IDS = {
  // Probes (ticket #516), not renames: they exercise the mechanism end to end in the e2e suites. Keep them.
  // `--default`: a fixture of the Free and complete builds (.storybook/LegacyRedirectTarget.stories.tsx).
  // `--docs`: a Docs page of the Free and complete builds. `--pro`: a PUBLIC Pro story (the Pro demo carries
  // no internal fixture), so a rename of that story must update this entry too: the destination check says so.
  'internal-legacy-redirect-probe--default': 'internal-legacyredirecttarget--default',
  'internal-legacy-redirect-probe--docs': 'internal-docsauditwrapper--docs',
  'internal-legacy-redirect-probe--pro': 'pro-rebasenotice--playground',
  // #526: "Pro/Showcase/Invoices with Change Summary" removed, replaced by "Pro/Showcase/Record editing integrity"
  // (sales orders). `--review-lines-dialog` has no exact equivalent: the orders' review dialog shows line entries too.
  'pro-showcase-invoices-with-change-summary--docs': 'pro-showcase-record-editing-integrity--docs',
  'pro-showcase-invoices-with-change-summary--review-changes': 'pro-showcase-record-editing-integrity--sales-order-review-changes',
  'pro-showcase-invoices-with-change-summary--manual': 'pro-showcase-record-editing-integrity--sales-order-manual',
  'pro-showcase-invoices-with-change-summary--review-dialog': 'pro-showcase-record-editing-integrity--sales-order-review-dialog',
  'pro-showcase-invoices-with-change-summary--review-line-items': 'pro-showcase-record-editing-integrity--sales-order-review-lines',
  'pro-showcase-invoices-with-change-summary--review-order-only': 'pro-showcase-record-editing-integrity--sales-order-review-order-only',
  'pro-showcase-invoices-with-change-summary--review-lines-dialog': 'pro-showcase-record-editing-integrity--sales-order-review-dialog',
  'pro-showcase-invoices-with-change-summary--server-update': 'pro-showcase-record-editing-integrity--sales-order-server-update',
};

// `path` of the manager: `/story/<id>` or `/docs/<id>`, possibly followed by more segments (kept).
var MANAGER_PATH = /^\/(story|docs)\/([^/]+)(\/.*)?$/;

function lookup(ids, id) {
  // Own keys only: `?id=constructor` or `?id=__proto__` must not resolve to Object.prototype members.
  return Object.prototype.hasOwnProperty.call(ids, id) && typeof ids[id] === 'string' ? ids[id] : null;
}

function decode(raw) {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ES5 has no optional catch binding
  } catch (e) {
    return null;
  }
}

/**
 * The URL a link to a renamed story must be replaced with, or `null` when it carries no old id.
 *
 * Only the value of the `path` (manager) and `id` (preview) query parameters changes, wherever they are
 * in the query and however they are encoded (`path=%2Fstory%2F...`, `i%64=` are decoded to be matched); every
 * other parameter (`viewMode`, `args`, `globals`, foreign ones) and the hash are kept byte for byte, so are the
 * origin, credentials and the path prefix (`/`, `/formrail/storybook/`, `/formrail/pro/`). Matching is exact
 * and case-sensitive, like Storybook's ids: `/STORY/<old>`, `?id=<OLD>`, `/x/story/<old>` are left alone.
 * Whatever follows the id in `path` is written back percent-encoded, so `%26` there never becomes a new
 * parameter.
 *
 * @param {string} href the full URL of the page running the redirect
 * @param {Object<string, string>} [ids] the map (default `LEGACY_STORY_IDS`; the tests pass their own)
 * @returns {string | null} an absolute URL, or `null`
 */
export function resolveLegacyStory(href, ids) {
  var map = ids || LEGACY_STORY_IDS;
  var url;
  try {
    url = new URL(href);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ES5 has no optional catch binding
  } catch (e) {
    return null;
  }
  if (url.search.length < 2) return null;
  var parts = url.search.slice(1).split('&');
  var changed = false;
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if (eq === -1) continue;
    // The name is decoded too: Storybook reads the query with URLSearchParams, for which `i%64=` IS `id=`, so
    // an encoded name must be rewritten like a plain one (otherwise Storybook would still see the old id).
    var name = decode(parts[i].slice(0, eq));
    var value = decode(parts[i].slice(eq + 1));
    if (value === null) continue;
    var next = null;
    if (name === 'id') {
      next = lookup(map, value);
    } else if (name === 'path') {
      var match = MANAGER_PATH.exec(value);
      var target = match && lookup(map, match[2]);
      if (target) next = '/' + match[1] + '/' + target + (match[3] || '');
    }
    if (next !== null) {
      // Written the way Storybook writes it (`path=/story/...`): slashes left as they are.
      parts[i] = parts[i].slice(0, eq + 1) + encodeURIComponent(next).replace(/%2F/g, '/');
      changed = true;
    }
  }
  if (!changed) return null;
  // Through the URL object, not `origin + pathname`: `origin` is "null" for a `file:` URL and drops `user:pw@`.
  // The parts come from `url.search`, already serialized, so assigning them back changes nothing else.
  url.search = '?' + parts.join('&');
  return url.href;
}
