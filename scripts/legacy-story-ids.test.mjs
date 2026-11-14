import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as espree from 'espree';
import { describe, expect, it } from 'vitest';
import { LEGACY_STORY_IDS, resolveLegacyStory } from '../.storybook/legacy-story-ids.mjs';
import { LEGACY_STORY_IDS_FILE, legacyRedirectScript, stripComments, withLegacyRedirect } from '../.storybook/legacy-story-redirect.mjs';
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
    // Round 2 of the review (#535): what follows the id is re-encoded as a component, so an encoded `&`/`=`
    // there stays inside `path` instead of becoming a new parameter (`encodeURI` would write them raw).
    [
      'manager, encoded & and = after the id stay encoded (no injected parameter)',
      `${SB}?path=/story/showcase-old--crud/a%26b%3Dc&viewMode=story`,
      `${SB}?path=/story/showcase-new--crud/a%26b%3Dc&viewMode=story`,
    ],
    // Storybook reads the query with URLSearchParams, for which `i%64` is `id`: rewritten, name kept as written.
    ['iframe, encoded parameter name', `${SB}iframe.html?i%64=showcase-old--crud&viewMode=story`, `${SB}iframe.html?i%64=showcase-new--crud&viewMode=story`],
    ['manager, encoded parameter name', `${SB}?p%61th=/story/showcase-old--crud`, `${SB}?p%61th=/story/showcase-new--crud`],
    ['a file: URL (opened from disk)', 'file:///tmp/storybook-static/iframe.html?id=showcase-old--crud&viewMode=story', 'file:///tmp/storybook-static/iframe.html?id=showcase-new--crud&viewMode=story'],
    ['credentials in the URL are kept', 'https://user:pw@example.com/sb/?path=/story/showcase-old--crud#h', 'https://user:pw@example.com/sb/?path=/story/showcase-new--crud#h'],
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
    // Round 2 (#535): anchored at the start and case-sensitive, like Storybook's own paths and ids.
    ['a story path that does not start the value', `${SB}?path=/x/story/showcase-old--crud`],
    ['an upper-case /STORY/ path', `${SB}?path=/STORY/showcase-old--crud`],
    ['an upper-case /DOCS/ path', `${SB}?path=/DOCS/showcase-old--docs`],
    ['an upper-case old id (iframe)', `${SB}iframe.html?id=SHOWCASE-OLD--CRUD&viewMode=story`],
    ['an upper-case old id (manager)', `${SB}?path=/story/SHOWCASE-OLD--CRUD`],
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
      'internal-legacy-redirect-probe--pro': 'pro-rebasenotice--playground',
    });
  });

  it('a rename of the public Pro story the probe lands on fails the destination check, naming the probe entry to update', () => {
    // The Pro index as it would be after a rename of `Pro/RebaseNotice` (e.g. by #531): the playground moved.
    const free = { name: 'storybook/index.json (Free)', entries: { 'internal-legacyredirecttarget--default': {}, 'internal-docsauditwrapper--docs': {} } };
    const renamedPro = { name: 'pro/index.json (Pro)', entries: { 'pro-record-conflict-notice--playground': {} } };
    expect(legacyIndexProblems(LEGACY_STORY_IDS, [free, renamedPro])).toEqual([
      'new id "pro-rebasenotice--playground" (for "internal-legacy-redirect-probe--pro") exists in none of storybook/index.json (Free), pro/index.json (Pro): ' +
        '"internal-legacy-redirect-probe--pro" is a redirect probe (ticket #516) whose target was renamed or removed; update the probe entry in .storybook/legacy-story-ids.mjs to point at an existing story',
    ]);
    // And with the Pro story where it is today, the same check passes.
    const pro = { name: 'pro/index.json (Pro)', entries: { 'pro-rebasenotice--playground': {} } };
    expect(legacyIndexProblems(LEGACY_STORY_IDS, [free, pro])).toEqual([]);
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
    // Round 2 (#535): the whole id must match, not a prefix of it.
    expect(legacyMapProblems({ 'a--b': 'c--d/x' })).toEqual([expect.stringContaining('the target is not a story id')]);
    expect(legacyMapProblems({ 'a--b': 'c--d ' })).toEqual([expect.stringContaining('the target is not a story id')]);
    expect(legacyMapProblems({ 'a--b/x': 'c--d' })).toEqual([expect.stringContaining('is not a story id')]);
    expect(legacyMapProblems({ ' a--b': 'c--d' })).toEqual([expect.stringContaining('is not a story id')]);
  });

  it('tells a Docs id by its `--docs` suffix, not by "docs" anywhere in it', () => {
    // A story of a component whose title contains "docs" is a story, not a Docs page.
    expect(legacyMapProblems({ 'x--default': 'internal-docsauditwrapper--default' })).toEqual([]);
    expect(legacyMapProblems({ 'old-docs-page--example': 'new--example' })).toEqual([]);
    expect(legacyMapProblems({ 'x--docs-example': 'y--docs-example' })).toEqual([]);
    expect(legacyMapProblems({ 'x--docs': 'internal-docsauditwrapper--default' })).toEqual([expect.stringContaining('Docs id must map to a Docs id')]);
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

  it('carries no comment into the pages (the source file keeps them)', () => {
    const code = /<script>([\s\S]*?)<\/script>/.exec(withLegacyRedirect(''))[1];
    expect(espree.parse(code, { ecmaVersion: 5, comment: true }).comments).toEqual([]);
    expect(espree.parse(source.replace(/^export\s+/gm, ''), { ecmaVersion: 5, comment: true }).comments.length).toBeGreaterThan(5);
  });

  it('stripComments drops whole-line and block comments, keeps code (regex literals included)', () => {
    const input = [
      '// a line comment',
      '/** one-line block */',
      '/**',
      ' * a block',
      ' */',
      'var A = /^\\/(story|docs)\\/([^/]+)(\\/.*)?$/;',
      '  // indented comment',
      '',
      "var b = 'x'; // trailing comment stays",
      '/* block',
      'still block */',
      'var c = 1;',
    ].join('\n');
    expect(stripComments(input)).toBe(["var A = /^\\/(story|docs)\\/([^/]+)(\\/.*)?$/;", "var b = 'x'; // trailing comment stays", 'var c = 1;'].join('\n'));
  });

  describe('stripComments, by position (round 3 of #516)', () => {
    const tokens = (code) => espree.tokenize(code, { ecmaVersion: 'latest', sourceType: 'module' }).map((t) => `${t.type}:${t.value}`);

    it('keeps the code of the line a block comment closes on, and drops a `// note` after the closing', () => {
      expect(stripComments('/* a\nb */ // note\nvar y = 1;')).toBe('var y = 1;');
    });

    it('treats `/*/` as an opening: the code after it is inside the comment, the code after the closing is kept', () => {
      expect(stripComments('/*/\nvar y = 1;\n*/\nvar z = 2;')).toBe('var z = 2;');
    });

    it('keeps the code that follows a one-line block comment', () => {
      expect(stripComments('/** x */ var x = 1;').trim()).toBe('var x = 1;');
      expect(stripComments('/** x */var x = 1;')).toBe('var x = 1;');
      expect(stripComments('var a = 1;\n/**/var b = 2;')).toBe('var a = 1;\nvar b = 2;');
    });

    it('keeps the code that follows the closing of a block comment', () => {
      expect(stripComments('/*\n * x\n */ var x = 1;\nvar y = 2;').trim()).toBe('var x = 1;\nvar y = 2;');
      expect(tokens(stripComments('/* a\n*/ var x = 1;'))).toEqual(tokens('var x = 1;'));
    });

    it('does not read a `//` or a `/*` inside a string, a regex or a template as a comment', () => {
      const code = [
        "var a = 'http://example.com'; var b = \"/* not a comment */\";",
        'var c = /\\/\\/|\\/\\*/;',
        'var d = `x // y /* z */ ${1}`;',
        'var e = "a" + /*inline*/ "b";',
      ].join('\n');
      expect(stripComments(code)).toBe(code);
    });

    it('keeps the blank lines inside a multi-line template, drops the other blank lines', () => {
      expect(stripComments('var a = `x\n\ny`;\n\n// c\nvar b = 1;')).toBe('var a = `x\n\ny`;\nvar b = 1;');
    });

    it('keeps a comment that follows code on its line (as it always has)', () => {
      expect(stripComments('var a = 1; /* t */ // u\nvar b = 2; // v')).toBe('var a = 1; /* t */ // u\nvar b = 2; // v');
    });

    it('accepts `export` and throws a clear error on a source that does not parse', () => {
      expect(stripComments('// c\nexport function f() {}')).toBe('export function f() {}');
      expect(() => stripComments('var a = ;\n// c')).toThrow(/stripComments: the source does not parse/);
      expect(() => stripComments('var s = "/*";\n/* never closed')).toThrow(/does not parse/);
    });

    it('the real source gives the tokens of the source, with no comment left', () => {
      const code = stripComments(source);
      expect(tokens(code)).toEqual(tokens(source));
      expect(espree.parse(code, { ecmaVersion: 'latest', sourceType: 'module', comment: true }).comments).toEqual([]);
    });
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
