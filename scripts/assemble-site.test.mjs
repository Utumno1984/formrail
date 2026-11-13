import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveRedirect } from '../site-root/redirect.mjs';
import { assembleSite, themeTokensToRoot } from './assemble-site.mjs';
import { EARLY_ACCESS_URL } from './site-config.mjs';

const O = 'https://utumno1984.github.io';
const B = `${O}/formrail/`;

describe('resolveRedirect', () => {
  const cases = [
    ['deep link to a docs page', `${B}?path=/docs/introduction--docs`, 'index', `${B}storybook/?path=/docs/introduction--docs`],
    [
      'deep link with globals and hash',
      `${B}?path=/docs/a--docs&globals=theme:dark#anchor`,
      'index',
      `${B}storybook/?path=/docs/a--docs&globals=theme:dark#anchor`,
    ],
    ['path and hash together', `${B}?path=/story/a--b#x`, 'index', `${B}storybook/?path=/story/a--b#x`],
    ['index.html spelled out', `${B}index.html?path=/docs/a--docs`, 'index', `${B}storybook/?path=/docs/a--docs`],
    ['id / viewMode / args only', `${B}?id=a--b&viewMode=story&args=x:1`, 'index', `${B}storybook/?id=a--b&viewMode=story&args=x:1`],
    [
      'foreign and Storybook parameters together are all forwarded',
      `${B}?utm_source=x&path=/docs/a--docs`,
      'index',
      `${B}storybook/?utm_source=x&path=/docs/a--docs`,
    ],
    ['iframe link', `${B}iframe.html?id=x&viewMode=story`, 'iframe', `${B}storybook/iframe.html?id=x&viewMode=story`],
    ['iframe link with hash', `${B}iframe.html?id=x&viewMode=docs#h`, 'iframe', `${B}storybook/iframe.html?id=x&viewMode=docs#h`],
    ['bare iframe.html', `${B}iframe.html`, 'iframe', `${B}storybook/iframe.html`],
    ['bare iframe.html with foreign parameters', `${B}iframe.html?utm_source=x`, 'iframe', `${B}storybook/iframe.html?utm_source=x`],
    ['host without a prefix (custom domain)', `${O}/?path=/docs/a--docs`, 'index', `${O}/storybook/?path=/docs/a--docs`],
    [
      'encoded characters are not re-encoded',
      `${B}?path=/story/a--b&args=label:Caf%C3%A9`,
      'index',
      `${B}storybook/?path=/story/a--b&args=label:Caf%C3%A9`,
    ],
  ];
  it.each(cases)('%s', (_name, from, page, to) => {
    expect(resolveRedirect(from, page)).toBe(to);
  });

  // Ticket #382: the root is the landing page now, not a redirector.
  it.each([
    ['bare root', B],
    ['index.html spelled out', `${B}index.html`],
    ['only a hash', `${B}#top`],
    ['the Pro anchor', `${B}#pro`],
    ['the Pro page for teams (ticket #490)', `${B}teams/`],
    ['the Pro page for teams with foreign parameters', `${B}teams/?utm_source=x#license`],
    ['the privacy page', `${B}privacy/`],
    ['foreign parameters', `${B}?utm_source=x`],
    ['custom domain without a prefix', `${O}/`],
  ])('%s stays on the landing', (_name, href) => {
    expect(resolveRedirect(href, 'index')).toBeNull();
  });

  it('never redirects a URL that is already under storybook/ (no double prefix, no loop)', () => {
    expect(resolveRedirect(`${B}storybook/?path=/docs/a--docs`, 'index')).toBeNull();
    expect(resolveRedirect(`${B}storybook/index.html?path=/docs/a--docs`, 'index')).toBeNull();
    expect(resolveRedirect(`${B}storybook/iframe.html?id=x&viewMode=story`, 'iframe')).toBeNull();
  });

  it('is idempotent: following the result again does not redirect', () => {
    for (const [, from, page] of cases) {
      const once = resolveRedirect(from, page);
      expect(resolveRedirect(once, page)).toBeNull();
    }
  });
});

describe('assembleSite', () => {
  const dirs = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function setup() {
    const tmp = mkdtempSync(path.join(tmpdir(), 'assemble-site-'));
    dirs.push(tmp);
    const storybookDir = path.join(tmp, 'storybook-static');
    mkdirSync(path.join(storybookDir, 'assets'), { recursive: true });
    writeFileSync(path.join(storybookDir, 'index.html'), '<!-- manager -->');
    writeFileSync(path.join(storybookDir, 'iframe.html'), '<!-- preview -->');
    writeFileSync(path.join(storybookDir, 'assets', '_x.js'), 'x');
    return { tmp, storybookDir, outDir: path.join(tmp, 'site') };
  }

  it('builds the structure: root files, storybook/, 404.html, .nojekyll, empty pro/', () => {
    const { storybookDir, outDir } = setup();
    assembleSite({ storybookDir, outDir });
    expect(readdirSync(outDir).sort()).toEqual([
      '.nojekyll',
      '404.html',
      'copy.js',
      'favicon.svg',
      'iframe.html',
      'index.html',
      'landing.css',
      'privacy',
      'pro',
      'storybook',
      'teams',
      'tokens.css',
    ]);
    expect(readFileSync(path.join(outDir, 'storybook', 'index.html'), 'utf8')).toBe('<!-- manager -->');
    expect(existsSync(path.join(outDir, 'storybook', 'assets', '_x.js'))).toBe(true);
    expect(readdirSync(path.join(outDir, 'pro'))).toEqual([]);
    expect(readFileSync(path.join(outDir, '.nojekyll'), 'utf8')).toBe('');
  });

  it('iframe.html is the redirect; index.html is the landing and carries the same redirect for old links', () => {
    const { storybookDir, outDir } = setup();
    assembleSite({ storybookDir, outDir });
    for (const file of ['index.html', 'iframe.html']) {
      const html = readFileSync(path.join(outDir, file), 'utf8');
      expect(html).not.toContain('<!-- manager -->');
      expect(html).not.toContain('/*REDIRECT_FN*/');
      expect(html).not.toMatch(/^export /m);
      expect(html).toContain('location.replace');
      expect(html).not.toContain('location.assign');
    }
    const iframe = readFileSync(path.join(outDir, 'iframe.html'), 'utf8');
    expect(iframe).toContain('<noscript>');
    expect(iframe).toContain('href="storybook/iframe.html"');
    expect(iframe).not.toMatch(/<script[^>]*\ssrc=/);
    const landing = readFileSync(path.join(outDir, 'index.html'), 'utf8');
    expect(landing).toContain('<h1');
    // The only external script of the landing is its own optional copy button.
    expect([...landing.matchAll(/<script[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1])).toEqual(['copy.js']);
  });

  it('the inlined script behaves like the tested function (runs it with a fake location)', () => {
    const { storybookDir, outDir } = setup();
    assembleSite({ storybookDir, outDir });
    const run = (file, href) => {
      const html = readFileSync(path.join(outDir, file), 'utf8');
      const code = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
      const replaced = [];
      vm.runInNewContext(code, {
        URL,
        location: { href, replace: (u) => replaced.push(u) },
      });
      return replaced;
    };
    expect(run('index.html', `${B}?path=/docs/a--docs#h`)).toEqual([`${B}storybook/?path=/docs/a--docs#h`]);
    expect(run('index.html', B)).toEqual([]);
    expect(run('index.html', `${B}#pro`)).toEqual([]);
    expect(run('iframe.html', `${B}iframe.html?id=x&viewMode=story`)).toEqual([`${B}storybook/iframe.html?id=x&viewMode=story`]);
  });

  // The invariant: everything that can fail is read/validated before the previous output is touched.
  describe.each([['redirect.mjs'], ['landing.css'], ['copy.js'], ['404.html'], ['iframe.html'], ['teams.html'], ['privacy.html']])(
    'missing site-root/%s',
    (missing) => {
      it('fails before outDir is touched (the previous site stays intact)', () => {
        const { tmp, storybookDir, outDir } = setup();
        const siteRootDir = path.join(tmp, 'site-root');
        cpSync(path.join(import.meta.dirname, '..', 'site-root'), siteRootDir, {
          recursive: true,
        });
        rmSync(path.join(siteRootDir, missing));
        mkdirSync(outDir);
        writeFileSync(path.join(outDir, 'previous.txt'), 'published');
        expect(() => assembleSite({ storybookDir, siteRootDir, outDir })).toThrow();
        expect(readFileSync(path.join(outDir, 'previous.txt'), 'utf8')).toBe('published');
      });
    },
  );

  it('a missing favicon fails before outDir is touched', () => {
    const { tmp, storybookDir, outDir } = setup();
    mkdirSync(outDir);
    writeFileSync(path.join(outDir, 'previous.txt'), 'published');
    expect(() =>
      assembleSite({
        storybookDir,
        outDir,
        faviconPath: path.join(tmp, 'nope.svg'),
      }),
    ).toThrow(/favicon/i);
    expect(readFileSync(path.join(outDir, 'previous.txt'), 'utf8')).toBe('published');
  });

  it('404.html has no script and links to the Storybook with the prefix', () => {
    const { storybookDir, outDir } = setup();
    assembleSite({ storybookDir, outDir, siteBase: '/some-repo/' });
    const html = readFileSync(path.join(outDir, '404.html'), 'utf8');
    expect(html).not.toContain('<script');
    expect(html).toContain('href="/some-repo/storybook/"');
    expect(html).not.toContain('{{SITE_BASE}}');
  });

  it('replaces a stale output folder instead of merging into it', () => {
    const { storybookDir, outDir } = setup();
    mkdirSync(outDir);
    writeFileSync(path.join(outDir, 'stale.txt'), 'old');
    assembleSite({ storybookDir, outDir });
    expect(existsSync(path.join(outDir, 'stale.txt'))).toBe(false);
  });

  it('copies the Pro demo build into pro/ and leaves the Free one untouched', () => {
    const { tmp, storybookDir, outDir } = setup();
    const proDir = path.join(tmp, 'storybook-static-pro');
    mkdirSync(path.join(proDir, 'assets'), { recursive: true });
    writeFileSync(path.join(proDir, 'index.html'), '<!-- pro manager -->');
    writeFileSync(path.join(proDir, 'assets', '_p.js'), 'p');
    assembleSite({ storybookDir, proStorybookDir: proDir, outDir });
    expect(readFileSync(path.join(outDir, 'pro', 'index.html'), 'utf8')).toBe('<!-- pro manager -->');
    expect(existsSync(path.join(outDir, 'pro', 'assets', '_p.js'))).toBe(true);
    expect(readFileSync(path.join(outDir, 'storybook', 'index.html'), 'utf8')).toBe('<!-- manager -->');
    expect(existsSync(path.join(outDir, 'storybook', 'assets', '_p.js'))).toBe(false);
  });

  it('fails loudly when the Pro demo build was requested but not built', () => {
    const { tmp, storybookDir, outDir } = setup();
    expect(() =>
      assembleSite({
        storybookDir,
        proStorybookDir: path.join(tmp, 'missing'),
        outDir,
      }),
    ).toThrow(/build-storybook:pro/);
    expect(existsSync(outDir)).toBe(false);
  });

  it('fails loudly when the Storybook was not built', () => {
    const { tmp, outDir } = setup();
    expect(() => assembleSite({ storybookDir: path.join(tmp, 'missing'), outDir })).toThrow(/build-storybook/);
    expect(existsSync(outDir)).toBe(false);
  });
});

describe('landing: early access call-to-action (ticket #382)', () => {
  const dirs = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function build(options) {
    const tmp = mkdtempSync(path.join(tmpdir(), 'assemble-landing-'));
    dirs.push(tmp);
    const storybookDir = path.join(tmp, 'storybook-static');
    mkdirSync(storybookDir);
    writeFileSync(path.join(storybookDir, 'index.html'), '<!-- manager -->');
    const outDir = path.join(tmp, 'site');
    assembleSite({ storybookDir, outDir, ...options });
    return readFileSync(path.join(outDir, 'index.html'), 'utf8');
  }

  it('the default build carries the CTA pointing at the committed form URL', () => {
    const html = build();
    expect(html).toContain(`href="${EARLY_ACCESS_URL}"`);
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('Request early access');
    expect(html).toContain('see the privacy note in the form');
    expect(html).toContain('href="privacy/"');
  });

  it('with an empty URL the CTA is not in the page at all', () => {
    for (const html of [build({ earlyAccessUrl: '' })]) {
      expect(html).not.toContain('Request early access');
      expect(html).not.toContain('EARLY_ACCESS');
      expect(html).not.toContain('{{');
      expect(html).not.toMatch(/href="#?"/);
      expect(html).toContain('id="pro"');
    }
  });

  it('with a URL the CTA is a rel=noopener link to exactly that URL, markers removed', () => {
    const html = build({ earlyAccessUrl: 'https://tally.so/r/abc123?a=1&b=2' });
    expect(html).toContain('href="https://tally.so/r/abc123?a=1&amp;b=2"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('Request early access');
    expect(html).toContain('Opens an external form');
    expect(html).not.toContain('EARLY_ACCESS');
    expect(html).not.toContain('{{');
  });

  it.each(['not a url', 'http://tally.so/r/x', 'javascript:alert(1)', '#'])('rejects %s', (bad) => {
    expect(() => build({ earlyAccessUrl: bad })).toThrow(/EARLY_ACCESS_URL/);
  });
});

describe('themeTokensToRoot', () => {
  it('re-emits the declarations of @theme static under :root, drops comments, keyframes and other blocks', () => {
    const css = `@custom-variant x { &:hover { @slot; } }
@theme static {
  /* a comment; with a semicolon */
  --color-rop-text: #111;
  --font-rop-sans: system-ui, 'Segoe UI', sans-serif;
  @keyframes spin { to { rotate: 360deg; } }
  --radius-rop-sm: 0.25rem;
}
@theme reference { --color-rop-hover: red; }`;
    expect(themeTokensToRoot(css)).toBe(
      ":root {\n  --color-rop-text: #111;\n  --font-rop-sans: system-ui, 'Segoe UI', sans-serif;\n  --radius-rop-sm: 0.25rem;\n}\n",
    );
  });

  it('throws when there is no @theme static block', () => {
    expect(() => themeTokensToRoot('body { color: red }')).toThrow(/@theme static/);
  });

  it('on the real theme: every token the landing stylesheet uses is declared', () => {
    const root = themeTokensToRoot(readFileSync(new URL('../packages/core/src/styles/tokens.css', import.meta.url), 'utf8'));
    const used = new Set(
      readFileSync(new URL('../site-root/landing.css', import.meta.url), 'utf8')
        .match(/var\((--[a-z0-9-]+)\)/g)
        ?.map((m) => m.slice(4, -1)),
    );
    expect(used.size).toBeGreaterThan(10);
    for (const name of used) expect(root, name).toContain(`  ${name}:`);
    expect(root).not.toContain('@keyframes');
  });
});
