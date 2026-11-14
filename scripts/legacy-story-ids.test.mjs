import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as espree from 'espree';
import { describe, expect, it } from 'vitest';
import { LEGACY_STORY_IDS, resolveLegacyStory } from '../.storybook/legacy-story-ids.mjs';
import { LEGACY_STORY_IDS_FILE, legacyRedirectScript, withLegacyRedirect } from '../.storybook/legacy-story-redirect.mjs';
import { legacyIndexProblems, legacyMapProblems } from './legacy-story-ids-check.mjs';

// Ticket #516: redirects of renamed story ids. A fixed map, so these cases do not depend on the real one.
const MAP = {
  'showcase-old--docs': 'showcase-new--docs',
  'showcase-old--crud': 'showcase-new--crud',
};
const SB = 'https://utumno1984.github.io/formrail/storybook/';
const PRO = 'https://utumno1984.github.io/formrail/pro/';
const LOCAL = 'http://localhost:6006/';

describe('resolveLegacyStory', () => {
  it.each([
    ['manager, Docs page', `${SB}?path=/docs/showcase-old--docs`, `${SB}?path=/docs/showcase-new--docs`],
    ['manager, story', `${SB}?path=/story/showcase-old--crud`, `${SB}?path=/story/showcase-new--crud`],
    ['manager, local root', `${LOCAL}?path=/story/showcase-old--crud`, `${LOCAL}?path=/story/showcase-new--crud`],
    ['manager, index.html spelled out', `${SB}index.html?path=/story/showcase-old--crud`, `${SB}index.html?path=/story/showcase-new--crud`],
    ['manager, Pro build prefix', `${PRO}?path=/docs/showcase-old--docs`, `${PRO}?path=/docs/showcase-new--docs`],
    [
      'iframe, story with args (Storybook URL syntax kept byte for byte)',
      `${SB}iframe.html?id=showcase-old--crud&viewMode=story&args=label:Caf%C3%A9;open:!true;size:lg`,
      `${SB}iframe.html?id=showcase-new--crud&viewMode=story&args=label:Caf%C3%A9;open:!true;size:lg`,
    ],
    [
      'iframe, Docs page',
      `${LOCAL}iframe.html?viewMode=docs&id=showcase-old--docs`,
      `${LOCAL}iframe.html?viewMode=docs&id=showcase-new--docs`,
    ],
    [
      'manager, globals, foreign parameters and hash kept',
      `${SB}?utm_source=post&path=/docs/showcase-old--docs&globals=backgrounds.value:dark;viewport:mobile1#anchor`,
      `${SB}?utm_source=post&path=/docs/showcase-new--docs&globals=backgrounds.value:dark;viewport:mobile1#anchor`,
    ],
    ['manager, encoded path (%2F)', `${SB}?path=%2Fstory%2Fshowcase-old--crud&args=x:1`, `${SB}?path=/story/showcase-new--crud&args=x:1`],
    ['manager, encoded path (lowercase %2f)', `${SB}?path=%2fdocs%2fshowcase-old--docs`, `${SB}?path=/docs/showcase-new--docs`],
    ['iframe, encoded id', `${SB}iframe.html?id=showcase%2Dold--crud&viewMode=story`, `${SB}iframe.html?id=showcase-new--crud&viewMode=story`],
    ['manager, segments after the id kept', `${SB}?path=/story/showcase-old--crud/extra`, `${SB}?path=/story/showcase-new--crud/extra`],
    [
      'every occurrence of the parameter is rewritten',
      `${SB}iframe.html?id=showcase-old--crud&id=showcase-old--docs`,
      `${SB}iframe.html?id=showcase-new--crud&id=showcase-new--docs`,
    ],
  ])('%s', (_name, from, to) => {
    expect(resolveLegacyStory(from, MAP)).toBe(to);
  });

  it.each([
    ['an unknown id (manager)', `${SB}?path=/story/showcase-other--crud`],
    ['an unknown id (iframe)', `${SB}iframe.html?id=showcase-other--crud&viewMode=story`],
    ['an id that is already the new one (manager)', `${SB}?path=/docs/showcase-new--docs`],
    ['an id that is already the new one (iframe)', `${SB}iframe.html?id=showcase-new--crud&viewMode=story`],
    ['no query', SB],
    ['an empty query', `${SB}?`],
    ['a hash only', `${SB}#path=/story/showcase-old--crud`],
    ['an old id in a parameter that is neither path nor id', `${SB}?args=showcase-old--crud&selectedKind=showcase-old--crud`],
    ['a path that is not a story/docs path', `${SB}?path=/settings/showcase-old--crud`],
    ['an old id as a prefix of another id', `${SB}?path=/story/showcase-old--crud-more`],
    ['Object.prototype members', `${SB}iframe.html?id=constructor&viewMode=story`],
    ['__proto__', `${SB}?path=/story/__proto__`],
    ['a malformed percent sequence', `${SB}?path=%E0%A4%A&id=%`],
    ['a parameter with no value', `${SB}?path&id`],
    ['not a URL', 'not a url'],
  ])('null for %s', (_name, href) => {
    expect(resolveLegacyStory(href, MAP)).toBeNull();
  });

  it('is idempotent: the URL it returns is never redirected again (no loop, no double redirect)', () => {
    for (const from of [`${SB}?path=/docs/showcase-old--docs`, `${SB}iframe.html?id=showcase-old--crud&viewMode=story&args=a:1`]) {
      const once = resolveLegacyStory(from, MAP);
      expect(once).not.toBeNull();
      expect(resolveLegacyStory(once, MAP)).toBeNull();
    }
  });

  it('uses the real map by default (the probe resolves)', () => {
    expect(resolveLegacyStory(`${LOCAL}?path=/story/internal-legacy-redirect-probe--default`)).toBe(
      `${LOCAL}?path=/story/internal-legacyredirecttarget--default`,
    );
  });
});

describe('LEGACY_STORY_IDS (the real map)', () => {
  it('has no cycle, no chain, no malformed id, no Docs/story mismatch', () => {
    expect(legacyMapProblems(LEGACY_STORY_IDS)).toEqual([]);
  });

  it('ships the documented probes (used by the e2e suites)', () => {
    expect(LEGACY_STORY_IDS).toMatchObject({
      'internal-legacy-redirect-probe--default': 'internal-legacyredirecttarget--default',
      'internal-legacy-redirect-probe--docs': 'internal-docsauditwrapper--docs',
    });
  });

  it('no new id of the real map is redirected again', () => {
    for (const to of Object.values(LEGACY_STORY_IDS)) {
      expect(resolveLegacyStory(`${SB}?path=/story/${to}`)).toBeNull();
      expect(resolveLegacyStory(`${SB}iframe.html?id=${to}`)).toBeNull();
    }
  });
});

describe('legacyMapProblems', () => {
  it('accepts a well-formed map', () => {
    expect(legacyMapProblems(MAP)).toEqual([]);
    expect(legacyMapProblems({})).toEqual([]);
  });

  it('rejects an id that points at itself', () => {
    expect(legacyMapProblems({ 'a-b--c': 'a-b--c' })).toEqual([expect.stringContaining('points at itself')]);
  });

  it('rejects a cycle', () => {
    const problems = legacyMapProblems({ 'a--x': 'b--x', 'b--x': 'a--x' });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('a cycle (a--x -> b--x -> a--x)');
  });

  it('rejects a longer cycle', () => {
    expect(legacyMapProblems({ 'a--x': 'b--x', 'b--x': 'c--x', 'c--x': 'a--x' }).every((p) => p.includes('a cycle'))).toBe(true);
  });

  it('rejects a chain and says where to point the old id', () => {
    expect(legacyMapProblems({ 'a--x': 'b--x', 'b--x': 'c--x' })).toEqual([
      '"a--x" -> "b--x": a chain (a--x -> b--x -> c--x), "b--x" is itself an old id: point "a--x" at "c--x"',
    ]);
  });

  it('rejects malformed ids', () => {
    expect(legacyMapProblems({ 'Showcase/Invoices': 'showcase-new--docs' })).toEqual([expect.stringContaining('is not a story id')]);
    expect(legacyMapProblems({ 'a--b': '/story/c--d' })).toEqual([expect.stringContaining('the target is not a story id')]);
    expect(legacyMapProblems({ 'a--b': '' })).toEqual([expect.stringContaining('the target is not a story id')]);
    expect(legacyMapProblems({ 'a--b': 42 })).toEqual([expect.stringContaining('the target is not a story id')]);
    expect(legacyMapProblems({ 'a---b--c': 'd--e' })).toEqual([expect.stringContaining('is not a story id')]);
    expect(legacyMapProblems({ 'no-separator': 'd--e' })).toEqual([expect.stringContaining('is not a story id')]);
  });

  it('rejects a Docs id mapped to a story id and the other way round', () => {
    expect(legacyMapProblems({ 'a--docs': 'b--story' })).toEqual([expect.stringContaining('Docs id must map to a Docs id')]);
    expect(legacyMapProblems({ 'a--story': 'b--docs' })).toEqual([expect.stringContaining('Docs id must map to a Docs id')]);
  });

  it('rejects something that is not a plain object', () => {
    expect(legacyMapProblems(null)).toEqual(['the map is not a plain object']);
    expect(legacyMapProblems([])).toEqual(['the map is not a plain object']);
  });
});

describe('legacyIndexProblems', () => {
  const free = { name: 'Free', entries: { 'showcase-new--docs': {}, 'showcase-new--crud': {}, 'other--docs': {} } };
  const pro = { name: 'Pro', entries: { 'pro-new--docs': {} } };

  it('accepts targets found in either build', () => {
    expect(legacyIndexProblems({ ...MAP, 'pro-old--docs': 'pro-new--docs' }, [free, pro])).toEqual([]);
  });

  it('rejects a target found in no build', () => {
    expect(legacyIndexProblems({ 'showcase-old--docs': 'showcase-gone--docs' }, [free, pro])).toEqual([
      'new id "showcase-gone--docs" (for "showcase-old--docs") exists in none of Free, Pro',
    ]);
  });

  it('rejects an old id that still exists in a build (it would hide a real story)', () => {
    expect(legacyIndexProblems({ 'other--docs': 'showcase-new--docs' }, [free, pro])).toEqual([
      'old id "other--docs" still exists in Free: the redirect would hide it',
    ]);
    expect(legacyIndexProblems({ 'pro-new--docs': 'showcase-new--docs' }, [free, pro])).toEqual([
      'old id "pro-new--docs" still exists in Pro: the redirect would hide it',
    ]);
  });

  it('can check the old ids only', () => {
    expect(legacyIndexProblems({ 'showcase-old--docs': 'showcase-gone--docs' }, [free], { targets: false })).toEqual([]);
    expect(legacyIndexProblems({ 'other--docs': 'showcase-gone--docs' }, [free], { targets: false })).toHaveLength(1);
  });

  it('refuses to pass vacuously on no index or an empty one', () => {
    expect(() => legacyIndexProblems(MAP, [])).toThrow(/no index/);
    expect(() => legacyIndexProblems(MAP, [{ name: 'Free', entries: {} }])).toThrow(/has no entry/);
  });
});

describe('the inlined head script', () => {
  const source = readFileSync(LEGACY_STORY_IDS_FILE, 'utf8');

  /** Runs the <script> of withLegacyRedirect() with a fake location/history; returns the replaceState calls. */
  function run(href, html = withLegacyRedirect('')) {
    const code = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
    const calls = [];
    const errors = [];
    const sandbox = {
      URL,
      location: { href },
      history: { state: { kept: true }, replaceState: (...args) => calls.push(args) },
      console: { error: (...args) => errors.push(args) },
    };
    vm.runInNewContext(code, sandbox);
    return { calls, errors, sandbox };
  }

  it('the source of legacy-story-ids.mjs is ES5 once `export` is stripped (like site-root/redirect.mjs)', () => {
    const stripped = source.replace(/^export\s+/gm, '');
    expect(() => espree.parse(stripped, { ecmaVersion: 5 })).not.toThrow();
    expect(source).not.toMatch(/^\s*import\s/m);
    // The inlined script as a whole is ES5 too.
    expect(() => espree.parse(/<script>([\s\S]*?)<\/script>/.exec(withLegacyRedirect(''))[1], { ecmaVersion: 5 })).not.toThrow();
  });

  it('replaces an old URL in place, keeping history.state (no navigation, no new history entry)', () => {
    const { calls, errors } = run(`${SB}?path=/story/internal-legacy-redirect-probe--default&globals=a:b#h`);
    expect(calls).toEqual([[{ kept: true }, '', `${SB}?path=/story/internal-legacyredirecttarget--default&globals=a:b#h`]]);
    expect(errors).toEqual([]);
  });

  it('does nothing for a current id or a URL without one', () => {
    expect(run(`${SB}iframe.html?id=internal-legacyredirecttarget--default&viewMode=story`).calls).toEqual([]);
    expect(run(SB).calls).toEqual([]);
  });

  it('leaks nothing into the page globals', () => {
    const { sandbox } = run(SB);
    expect(Object.keys(sandbox).sort()).toEqual(['URL', 'console', 'history', 'location']);
  });

  it('a failing redirect is logged and does not throw (Storybook still loads the URL as it is)', () => {
    const html = withLegacyRedirect('');
    const code = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
    const errors = [];
    expect(() =>
      vm.runInNewContext(code, {
        URL,
        location: { href: `${SB}?path=/story/internal-legacy-redirect-probe--default` },
        history: {
          replaceState: () => {
            throw new Error('SecurityError');
          },
        },
        console: { error: (...args) => errors.push(args) },
      }),
    ).not.toThrow();
    expect(errors).toHaveLength(1);
  });

  it('comes first, followed by the head Storybook built, unchanged', () => {
    const head = '<link rel="icon" href="./favicon.svg" />\n<script>/* manager-head */</script>';
    const html = withLegacyRedirect(head);
    expect(html.startsWith('<script>\n(function () {')).toBe(true);
    expect(html.endsWith(`</script>\n${head}`)).toBe(true);
    expect(withLegacyRedirect(undefined)).toContain('resolveLegacyStory(location.href)');
  });

  it('refuses a source it cannot inline', () => {
    expect(() => legacyRedirectScript('var x = 1;')).toThrow(/does not export resolveLegacyStory/);
    expect(() => legacyRedirectScript(`${source}\n// </SCRIPT>`)).toThrow(/cannot be inlined/);
    expect(() => legacyRedirectScript(`${source}\n// <!-- x`)).toThrow(/cannot be inlined/);
  });
});
