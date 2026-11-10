import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveRedirect } from '../site-root/redirect.mjs';
import { assembleSite } from './assemble-site.mjs';

const O = 'https://utumno1984.github.io';
const B = `${O}/react-object-page/`;

describe('resolveRedirect', () => {
  const cases = [
    ['deep link to a docs page', `${B}?path=/docs/introduction--docs`, 'index', `${B}storybook/?path=/docs/introduction--docs`],
    ['deep link with globals and hash', `${B}?path=/docs/a--docs&globals=theme:dark#anchor`, 'index', `${B}storybook/?path=/docs/a--docs&globals=theme:dark#anchor`],
    ['path and hash together', `${B}?path=/story/a--b#x`, 'index', `${B}storybook/?path=/story/a--b#x`],
    ['index.html spelled out', `${B}index.html?path=/docs/a--docs`, 'index', `${B}storybook/?path=/docs/a--docs`],
    ['id / viewMode / args only', `${B}?id=a--b&viewMode=story&args=x:1`, 'index', `${B}storybook/?id=a--b&viewMode=story&args=x:1`],
    ['bare root', B, 'index', `${B}storybook/`],
    ['bare root with only a hash', `${B}#top`, 'index', `${B}storybook/`],
    ['foreign parameters on the bare root', `${B}?utm_source=x`, 'index', `${B}storybook/`],
    ['foreign and Storybook parameters together are all forwarded', `${B}?utm_source=x&path=/docs/a--docs`, 'index', `${B}storybook/?utm_source=x&path=/docs/a--docs`],
    ['iframe link', `${B}iframe.html?id=x&viewMode=story`, 'iframe', `${B}storybook/iframe.html?id=x&viewMode=story`],
    ['iframe link with hash', `${B}iframe.html?id=x&viewMode=docs#h`, 'iframe', `${B}storybook/iframe.html?id=x&viewMode=docs#h`],
    ['bare iframe.html', `${B}iframe.html`, 'iframe', `${B}storybook/iframe.html`],
    ['host without a prefix (custom domain)', `${O}/?path=/docs/a--docs`, 'index', `${O}/storybook/?path=/docs/a--docs`],
    ['encoded characters are not re-encoded', `${B}?path=/story/a--b&args=label:Caf%C3%A9`, 'index', `${B}storybook/?path=/story/a--b&args=label:Caf%C3%A9`],
  ];
  it.each(cases)('%s', (_name, from, page, to) => {
    expect(resolveRedirect(from, page)).toBe(to);
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
    expect(readdirSync(outDir).sort()).toEqual(['.nojekyll', '404.html', 'iframe.html', 'index.html', 'pro', 'storybook']);
    expect(readFileSync(path.join(outDir, 'storybook', 'index.html'), 'utf8')).toBe('<!-- manager -->');
    expect(existsSync(path.join(outDir, 'storybook', 'assets', '_x.js'))).toBe(true);
    expect(readdirSync(path.join(outDir, 'pro'))).toEqual([]);
    expect(readFileSync(path.join(outDir, '.nojekyll'), 'utf8')).toBe('');
  });

  it('the root index.html is the redirect, not the Storybook manager', () => {
    const { storybookDir, outDir } = setup();
    assembleSite({ storybookDir, outDir });
    for (const file of ['index.html', 'iframe.html']) {
      const html = readFileSync(path.join(outDir, file), 'utf8');
      expect(html).not.toContain('<!-- manager -->');
      expect(html).not.toContain('/*REDIRECT_FN*/');
      expect(html).not.toMatch(/^export /m);
      expect(html).toContain('<noscript>');
      expect(html).toContain('location.replace');
      expect(html).not.toContain('location.assign');
      expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    }
    expect(readFileSync(path.join(outDir, 'index.html'), 'utf8')).toContain('href="storybook/"');
    expect(readFileSync(path.join(outDir, 'iframe.html'), 'utf8')).toContain('href="storybook/iframe.html"');
  });

  it('the inlined script behaves like the tested function (runs it with a fake location)', () => {
    const { storybookDir, outDir } = setup();
    assembleSite({ storybookDir, outDir });
    const run = (file, href) => {
      const html = readFileSync(path.join(outDir, file), 'utf8');
      const code = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
      const replaced = [];
      vm.runInNewContext(code, { URL, location: { href, replace: (u) => replaced.push(u) } });
      return replaced;
    };
    expect(run('index.html', `${B}?path=/docs/a--docs#h`)).toEqual([`${B}storybook/?path=/docs/a--docs#h`]);
    expect(run('index.html', B)).toEqual([`${B}storybook/`]);
    expect(run('iframe.html', `${B}iframe.html?id=x&viewMode=story`)).toEqual([`${B}storybook/iframe.html?id=x&viewMode=story`]);
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

  it('fails loudly when the Storybook was not built', () => {
    const { tmp, outDir } = setup();
    expect(() => assembleSite({ storybookDir: path.join(tmp, 'missing'), outDir })).toThrow(/build-storybook/);
    expect(existsSync(outDir)).toBe(false);
  });
});
