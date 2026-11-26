import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultTreeAdapter, html as parse5Html, parse as parseHtml, parseFragment, serialize } from 'parse5';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleSite } from './assemble-site.mjs';
import { BEFORE_BODY, escapeText, formatDate, loadArticles, parseArticle, renderArticles, renderArticlesLinks, renderFeed } from './articles.mjs';

const SITE_ROOT = path.join(import.meta.dirname, '..', 'site-root');
const NOW = new Date('2026-11-26T10:00:00Z');
const ORIGIN = 'https://formrail.dev';

const source = (overrides = {}, body = '<p>Body.</p>') => {
  const meta = {
    title: 'A title',
    date: '2026-11-01',
    slug: 'a-title',
    description: 'A description.',
    author: 'An Author',
    ...overrides,
  };
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n${body}\n`;
};

describe('parseArticle', () => {
  it('reads the front matter and the body', () => {
    const a = parseArticle('articles/x.html', source());
    expect(a).toMatchObject({ title: 'A title', date: '2026-11-01', slug: 'a-title', description: 'A description.', author: 'An Author' });
    expect(a.body).toBe('<p>Body.</p>');
  });

  it.each(['title', 'date', 'slug', 'description', 'author'])('fails naming the file when "%s" is missing', (key) => {
    expect(() => parseArticle('articles/x.html', source({ [key]: undefined }))).toThrow(new RegExp(`^articles/x\\.html: .*"${key}"`));
  });

  it.each(['title', 'description', 'author'])('fails naming the file when "%s" is empty', (key) => {
    expect(() => parseArticle('articles/x.html', source({ [key]: '' }))).toThrow(/^articles\/x\.html: /);
  });

  it('fails naming the file with no front matter at all', () => {
    expect(() => parseArticle('articles/x.html', '<p>Hi</p>')).toThrow(/^articles\/x\.html: missing front matter/);
  });

  it.each(['Has Capitals', 'with space', 'UPPER', 'under_score', '-lead', 'trail-', 'double--dash', 'accenté'])('rejects the slug %j', (slug) => {
    expect(() => parseArticle('articles/x.html', source({ slug }))).toThrow(/^articles\/x\.html: "slug"/);
  });

  it.each(['2026-13-01', '2026-02-30', '26-11-01', '2026-1-1', 'yesterday'])('rejects the date %j', (date) => {
    expect(() => parseArticle('articles/x.html', source({ date }))).toThrow(/^articles\/x\.html: "date"/);
  });

  it('rejects an unknown or duplicated key, an h1 and a script in the body, an empty body', () => {
    expect(() => parseArticle('articles/x.html', source({ tags: 'a' }))).toThrow(/unknown front matter key "tags"/);
    expect(() => parseArticle('articles/x.html', source().replace('---\n', '---\ntitle: Twice\n'))).toThrow(/duplicate/);
    expect(() => parseArticle('articles/x.html', source({}, '<h1>Second</h1>'))).toThrow(/h1/);
    expect(() => parseArticle('articles/x.html', source({}, '<script>1</script>'))).toThrow(/script/);
    expect(() => parseArticle('articles/x.html', source({}, ''))).toThrow(/no body/);
  });
});

describe('parseArticle guards', () => {
  const parse = (body) => parseArticle('articles/x.html', source({}, body));

  it.each([
    ['<script/src=https://evil.test/x.js></script>', /^articles\/x\.html: the body must not contain a script/],
    ['<SCRIPT>1</SCRIPT>', /script/],
    ['<h1/>Title</h1>', /h1/],
    ['<H1>Title</H1>', /h1/],
    ['<iframe src="x.html"></iframe>', /iframe, embed, object, style, link, base, meta or form/],
    ['<embed src="x">', /embed/],
    ['<object data="x"></object>', /object/],
    ['<style>@import url(https://evil.test/a.css);</style>', /style/],
    ['<link rel="stylesheet" href="x.css">', /link/],
    ['<base href="https://evil.test/">', /base/],
    ['<meta http-equiv="refresh" content="0;url=https://evil.test">', /meta/],
    ['<form action="x"></form>', /form/],
    ['<p onclick="alert(1)">x</p>', /inline event handler/],
    ['<p/onclick=alert(1)>x</p>', /inline event handler/],
    ['<img alt="a" onerror = "x">', /inline event handler/],
    ['<a href="javascript:alert(1)">x</a>', /javascript: URL/],
    ['<a href="JavaScript :alert(1)">x</a>', /javascript: URL/],
    ['<img src="https://evil.test/p.png">', /src\/poster from another origin/],
    ['<img src=http://evil.test/p.png>', /src\/poster from another origin/],
    ['<img src="//evil.test/p.png">', /src\/poster from another origin/],
    ['<video poster="https://evil.test/p.png"></video>', /src\/poster from another origin/],
    ['<img srcset="a.png 1x, https://evil.test/b.png 2x">', /srcset from another origin/],
    ['<p style="background:url(https://evil.test/a.png)">x</p>', /inline style/],
    ['<a href="/x"onclick="y()">x</a>', /inline event handler/],
    ["<a href='/x'onclick='y()'>x</a>", /inline event handler/],
    ['<p ONCLICK="x()">x</p>', /inline event handler/],
    ['<img SRC="HTTPS://evil.test/x.png">', /src\/poster from another origin/],
    ['<img SRCSET="HTTPS://evil.test/x.png 1x">', /srcset from another origin/],
    ['<img src = "https://evil.test/x.png">', /src\/poster from another origin/],
    ['<img src=" https://evil.test/x.png">', /src\/poster from another origin/],
    ['<img src="http:evil.test/x.png">', /src\/poster from another origin/],
    ['<img src="/\\evil.test/x.png">', /src\/poster from another origin/],
    ['<img srcset = "https://evil.test/x.png 1x">', /srcset from another origin/],
    ['<img srcset="http:evil.test/x 1x">', /srcset from another origin/],
    ['<img srcset="/\\evil.test/x 1x">', /srcset from another origin/],
    ['<p STYLE = "background:URL (https://evil.test/a.png)">x</p>', /inline style/],
    ['<p style = "background: url (a.png)">x</p>', /inline style/],
    ['<a href="JAVASCRIPT:alert(1)">x</a>', /javascript: URL/],
    ['<IMG ONERROR="x()">', /inline event handler/],
    ['<img\n  alt="x"\n  src="https://e/x.png"\n>', /src\/poster from another origin/],
    ['<p onclick="x()">a</p><p>b</p>', /inline event handler/],
    ['<img src="https://e/x.png" title=\'Daniele\'s chart\'>', /src\/poster from another origin/],
    ['<img alt=\'Daniele\'s chart\' onerror="x()">', /inline event handler/],
    ['<img alt=it\'s src=https://e/x.png>', /src\/poster from another origin/],
    ['<img alt=a"b src=//e/x.png>', /src\/poster from another origin/],
    ['<p>x</p><img src=//e/x.png', /src\/poster from another origin/],
    ['<a title="a > b" onclick="x()">x</a>', /inline event handler/],
    ["<a title='a > b' onclick='x()'>x</a>", /inline event handler/],
  ])('rejects %s, naming the file and the reason', (body, reason) => {
    expect(() => parse(body)).toThrow(reason);
    expect(() => parse(body)).toThrow(/^articles\/x\.html: the body /);
  });

  it('still accepts external links, relative images and the usual content', () => {
    expect(() => parse('<h2>A</h2><p>See <a href="https://example.org/x">this</a> and <a href="../../storybook/?path=/docs/a--docs">that</a>.</p><img src="pic.png" alt=""><h3>B</h3><pre><code>a &lt; b</code></pre>')).not.toThrow();
  });

  it('accepts code and prose that only show handlers, URLs and tags escaped as text', () => {
    const body = [
      '<p>Avoid <code>href="javascript:void(0)"</code> placeholders.</p>',
      '<pre><code>&lt;Button onClick={save}&gt;Save&lt;/Button&gt;',
      'const online = navigator.onLine;',
      'let ongoing = 0;',
      'function save({ onSuccess = noop }) {}',
      'img.src = "https://cdn.example/x.png";',
      '&lt;script src="https://cdn/x.js"&gt;&lt;/script&gt;',
      '&lt;div style="background:url(a.png)"&gt;</code></pre>',
    ].join('\n');
    expect(() => parse(body)).not.toThrow();
  });

  it('stays linear on a long run of unclosed tags', () => {
    const start = Date.now();
    expect(() => parse('<a'.repeat(40000))).not.toThrow();
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it.each([
    // Unquoted values with a quote inside: the browser does not pair those quotes with the next quoted value.
    [`<img alt=it's title='x>y' onerror="x()">`, /inline event handler/],
    [`<img alt=a"b title="x>y" onerror="x()">`, /inline event handler/],
    [`<img alt=it's title='x>y' src=https://e/x.png>`, /src\/poster from another origin/],
    [`<a href=/x title=a"b data-x="1>2" onclick=alert(1)>x</a>`, /inline event handler/],
    [`<img title=a="b src="x>y" onerror=x()>`, /inline event handler/],
    [`<img alt="a" b' c='d>e' onerror=x()>`, /inline event handler/],
    // Any attribute that starts with "on", known handler or not.
    ['<input autofocus onfocus="x()">', /inline event handler/],
    ['<details open ontoggle="x()"><summary>x</summary></details>', /inline event handler/],
    ['<p onanimationstart="x()" onfuture="y()">x</p>', /inline event handler/],
    ['<svg onload="x()"></svg>', /inline event handler/],
    // URLs as the URL parser reads them: entities decoded, tabs and newlines removed, leading spaces trimmed.
    ['<a href="jav&#x61;script:alert(1)">x</a>', /javascript: URL/],
    ['<a href="java\tscript:alert(1)">x</a>', /javascript: URL/],
    ['<a href="java&Tab;scr&NewLine;ipt&colon;alert(1)">x</a>', /javascript: URL/],
    ['<a href="&#x20;&#x1;javascript:alert(1)">x</a>', /javascript: URL/],
    ['<button formaction="javascript:alert(1)">x</button>', /javascript: URL/],
    ['<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>', /javascript: URL/],
    ['<math><mi href="javascript:alert(1)">x</mi></math>', /javascript: URL/],
    ['<img src="h&#x74;tps://e/x.png">', /src\/poster from another origin/],
    ['<img src="ht\ntps://e/x.png">', /src\/poster from another origin/],
    ['<img src="\\\\e/x.png">', /src\/poster from another origin/],
    ['<img src="\\/e/x.png">', /src\/poster from another origin/],
    ['<video><source src="https://e/x.mp4"></video>', /src\/poster from another origin/],
    ['<img srcset="a.png 1x,https://e/x.png 2x">', /srcset from another origin/],
    ['<picture><source srcset="a.png 1x,\n//e/x.png 2x"><img src="a.png" alt=""></picture>', /srcset from another origin/],
    ['<table background="https://e/x.png"><tr><td>x</td></tr></table>', /background from another origin/],
    ['<a href="/x" ping="https://e/p">x</a>', /ping attribute/],
    ['<a href="/x" PING="/p">x</a>', /ping attribute/],
    ['<svg><image href="https://e/x.png"/></svg>', /SVG href \(image, use\.\.\.\) from another origin/],
    ['<svg><image xlink:href="//e/x.png"/></svg>', /SVG href/],
    ['<svg><use href="https://e/s.svg#i"/></svg>', /SVG href/],
    ['<svg><filter><feImage href="https://e/x.png"/></filter></svg>', /SVG href/],
    ['<svg><rect fill="url(https://e/p.svg#g)"/></svg>', /SVG url\(\) from another origin/],
    ['<svg><a href="#x"><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>', /animate an SVG href/],
    ['<svg><image href="a.png"><animate attributeName="xlink:href" values="a.png;https://e/x.png"/></image></svg>', /animate an SVG href/],
    // Elements and attributes wherever the parser puts them.
    ['<SVG><SCRIPT>1</SCRIPT></SVG>', /script/],
    ['<svg><style>@import url(https://e/a.css);</style></svg>', /iframe, embed, object, style/],
    ['<svg><foreignObject><iframe src="x.html"></iframe></foreignObject></svg>', /iframe, embed, object, style/],
    ['<body onload="x()">', /inline event handler/],
    ['<html onclick="x()">', /inline event handler/],
    ['<body background="https://e/x.png">', /background from another origin/],
    ['<table><tr><td onclick="x()">x</td></tr></table>', /inline event handler/],
    ['<template><img src="https://e/x.png"></template>', /src\/poster from another origin/],
    ['<template shadowrootmode="open"><p onclick="x()">x</p></template>', /inline event handler/],
    ['<noscript><img src="https://e/x.png"></noscript>', /src\/poster from another origin/],
    ['<noscript><p title="</noscript><img src=https://e/x.png>"></p></noscript>', /src\/poster from another origin/],
    ['<p>x</p></div></article></main><img src="https://e/x.png">', /src\/poster from another origin/],
    ['<h2>A</h2><h4', /skips a heading level \(h4 after h2\)/],
    // A body that ends inside a quote or a comment would swallow the page after it.
    ['<p>x</p><img alt="x', /ends inside an unfinished tag or comment/],
    ["<p>x</p><img alt='x", /ends inside an unfinished tag or comment/],
    ['<p>x</p><!-- note', /ends inside an unfinished tag or comment/],
    ['<svg><![CDATA[x', /ends inside an unfinished tag or comment/],
  ])('rejects %j as the HTML parser reads it, naming the file and the reason', (body, reason) => {
    expect(() => parse(body)).toThrow(reason);
    expect(() => parse(body)).toThrow(/^articles\/x\.html: the body /);
  });

  it('rejects every style attribute with a reason that names the CSP and the alternative', () => {
    for (const body of ['<p style="color:red">x</p>', '<p STYLE="">x</p>', '<svg><rect style="fill:red"/></svg>']) {
      expect(() => parse(body), body).toThrow(/^articles\/x\.html: the body must not contain a style attribute: inline styles are blocked by the page CSP, use a class\.$/);
    }
  });

  it('accepts what a browser reads as harmless, however it is spelled', () => {
    const body = [
      '<h2>Links and media</h2>',
      '<p><abbr title="JavaScript: the language">JS</abbr>, <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript">MDN</a>, <a href=/x title=\'it&#39;s\'>x</a>.</p>',
      '<p>It\'s "fine": 1 &lt; 2 &amp; <code>&lt;body onload="init()"&gt;</code>, <code>srcset="https://e/x.png 2x"</code>.</p>',
      '<img src="data:image/png;base64,AA==" alt=""><img srcset="a.png 1x, b.png 2x" src="a.png" alt="" data-src="https://e/x.png">',
      '<svg viewBox="0 0 1 1"><use href="#icon"/><image href="pic.png"/><rect fill="url(#g)"/><a href="https://example.org/">x</a></svg>',
      '<h3>Code</h3><pre><code>&lt;a ping="https://e/p" style="color:red"&gt;</code></pre>',
    ].join('\n');
    expect(() => parse(body)).not.toThrow();
  });

  it('parses the body where article.html puts it (BEFORE_BODY mirrors the template)', () => {
    const chain = (document) => {
      const path = [];
      const find = (node, trail) => {
        for (const child of node.childNodes ?? []) {
          if (child.tagName === 'span' && child.attrs.some((a) => a.value === 'body-here')) path.push(...trail, child.parentNode.childNodes.filter((n) => n.tagName && n !== child).map((n) => n.tagName).join('+'));
          else if (child.tagName) find(child, [...trail, child.tagName]);
        }
      };
      find(document, []);
      return path;
    };
    const marker = '<span id="body-here"></span>';
    const template = readFileSync(path.join(SITE_ROOT, 'article.html'), 'utf8').replace('{{BODY}}', marker);
    expect(chain(parseHtml(template))).toEqual(['html', 'body', 'main', 'article', 'div', 'h1+p']);
    expect(chain(parseHtml(`${BEFORE_BODY}${marker}`))).toEqual(chain(parseHtml(template)));
  });

  it('decides on what parse5 sees, not on how the tag is spelled (differential, 2,000 random tags, fixed seed)', () => {
    const div = defaultTreeAdapter.createElement('div', parse5Html.NS.HTML, []);
    const PIECES = ['a', '=', '"', "'", '>', ' ', '/', '\n', '<', ' onerror=x()', ' src=//e/x', ' src=https://e/x', ' src=x.png', ' title=', "it's", 'a"b', 'x>y'];
    // The tag splitter of the regex version, kept only to show that the sample exercises the cases it misread.
    const OLD_TAG = /<[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*'|["'])*(?:>|$)/;
    const verdict = (body) => {
      try {
        parse(body);
        return 'accepted';
      } catch (error) {
        return error.message;
      }
    };
    const elements = (node) => (node.childNodes ?? []).flatMap((child) => (child.tagName ? [child, ...elements(child)] : elements(child)));
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const seen = { accepted: 0, handler: 0, src: 0, unfinished: 0, oldSplitWrong: 0 };
    for (let k = 0; k < 2000; k++) {
      let body = '<img ';
      for (let j = 1 + Math.floor(random() * 12); j > 0; j--) body += PIECES[Math.floor(random() * PIECES.length)];
      body += '>tail';
      const errors = [];
      const fragment = parseFragment(div, body, { sourceCodeLocationInfo: true, onParseError: (e) => errors.push(e.code) });
      const got = verdict(body);
      if (errors.includes('eof-in-tag')) {
        seen.unfinished++;
        expect(got, body).not.toBe('accepted');
        continue;
      }
      const attrs = elements(fragment).flatMap((el) => el.attrs);
      const expected = attrs.some((a) => a.name.startsWith('on'))
        ? 'articles/x.html: the body must not contain an inline event handler (on...=).'
        : attrs.some((a) => a.name === 'src' && /^(?:https?:|[/\\]{2})/i.test(a.value.replace(/[\t\n\r]/g, '').trim()))
          ? 'articles/x.html: the body must not load src/poster from another origin (absolute http(s): or // URL): the page makes no third-party request.'
          : 'accepted';
      expect(got, body).toBe(expected);
      // The canonical spelling of the same tree (parse5's serialisation) gets the same verdict.
      expect(verdict(serialize(fragment)), body).toBe(got);
      seen[expected === 'accepted' ? 'accepted' : expected.includes('handler') ? 'handler' : 'src']++;
      const first = elements(fragment)[0];
      if (first && OLD_TAG.exec(body)[0].length !== first.sourceCodeLocation.startTag.endOffset) seen.oldSplitWrong++;
    }
    for (const [key, count] of Object.entries(seen)) expect(count, `${key} in ${JSON.stringify(seen)}`).toBeGreaterThanOrEqual(20);
  });

  it('stays fast on long runs of stray quotes (junk attribute names are harmless) and on a long unclosed value', () => {
    for (const [body, rejected] of [
      ['<a "'.repeat(40000), false],
      [`<a '"`.repeat(40000), false],
      [`<a${' "'.repeat(40000)}`, false],
      [`<a${'"'.repeat(80001)}`, false],
      [`<a title="${'x'.repeat(80000)}`, true],
    ]) {
      const start = Date.now();
      if (rejected) expect(() => parse(body)).toThrow(/ends inside an unfinished tag or comment/);
      else expect(() => parse(body)).not.toThrow();
      expect(Date.now() - start).toBeLessThan(2000);
    }
  });

  it('accepts a > inside a quoted attribute value', () => {
    expect(() => parse('<a title="a > b" href="/x">x</a>')).not.toThrow();
  });

  it('still rejects a real tag that follows escaped code in the same body', () => {
    expect(() => parse('<pre><code>&lt;b onclick="x"&gt;</code></pre><p onclick="y()">x</p>')).toThrow(/inline event handler/);
  });

  it('rejects a skipped heading level (h2 -> h4), and a first heading deeper than h2', () => {
    expect(() => parse('<h2>A</h2><h4>B</h4>')).toThrow(/^articles\/x\.html: the body skips a heading level \(h4 after h2\)/);
    expect(() => parse('<h3>A</h3>')).toThrow(/skips a heading level \(h3 after the page title\)/);
    expect(() => parse('<h2>A</h2><h3>B</h3><h2>C</h2><h3>D</h3><h4>E</h4>')).not.toThrow();
  });

  it('rejects control characters in the front matter and in the body', () => {
    expect(() => parseArticle('articles/x.html', source({ title: 'Bad\u0001title' }))).toThrow(/^articles\/x\.html: "title" contains a control character/);
    expect(() => parse('<p>bad\u0007body</p>')).toThrow(/^articles\/x\.html: the body contains a control character/);
  });

  it.each(['\uFFFE', '\uFFFF'])('rejects the non-character U+%s (invalid in XML 1.0) in both places', (ch) => {
    expect(() => parseArticle('articles/x.html', source({ description: `a${ch}b` }))).toThrow(/"description" contains a control character/);
    expect(() => parse(`<p>a${ch}b</p>`)).toThrow(/body contains a control character/);
  });

  it('accepts a CRLF file (front matter and closing line)', () => {
    const a = parseArticle('articles/x.html', source().replace(/\n/g, '\r\n'));
    expect(a).toMatchObject({ title: 'A title', author: 'An Author' });
    expect(a.body).toBe('<p>Body.</p>');
  });

  it('ignores a leading BOM', () => {
    expect(parseArticle('articles/x.html', `\uFEFF${source()}`).title).toBe('A title');
  });

  it('keeps YAML-style quotes literal', () => {
    expect(parseArticle('articles/x.html', source({ title: '"Quoted"' })).title).toBe('"Quoted"');
  });
});

describe('loadArticles', () => {
  const dirs = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function folder(files) {
    const dir = mkdtempSync(path.join(tmpdir(), 'articles-'));
    dirs.push(dir);
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
    return dir;
  }

  it('a missing folder is no article', () => {
    expect(loadArticles(path.join(tmpdir(), 'nope-articles'), { now: NOW })).toEqual({ published: [], scheduled: [] });
  });

  it('sorts by date, newest first (same day: by slug)', () => {
    const dir = folder({
      'a.html': source({ slug: 'old', date: '2026-01-01' }),
      'b.html': source({ slug: 'new', date: '2026-11-20' }),
      'c.html': source({ slug: 'same-b', date: '2026-06-01' }),
      'd.html': source({ slug: 'same-a', date: '2026-06-01' }),
    });
    expect(loadArticles(dir, { now: NOW }).published.map((a) => a.slug)).toEqual(['new', 'same-a', 'same-b', 'old']);
  });

  it('a future date is not published yet; the build day itself is', () => {
    const dir = folder({
      'a.html': source({ slug: 'today', date: '2026-11-26' }),
      'b.html': source({ slug: 'tomorrow', date: '2026-11-27' }),
    });
    const { published, scheduled } = loadArticles(dir, { now: NOW });
    expect(published.map((a) => a.slug)).toEqual(['today']);
    expect(scheduled.map((a) => a.slug)).toEqual(['tomorrow']);
  });

  it('a duplicate slug fails and names both files', () => {
    const dir = folder({ 'a.html': source(), 'b.html': source() });
    expect(() => loadArticles(dir, { now: NOW })).toThrow(/articles\/b\.html: duplicate slug "a-title" \(also used by articles\/a\.html\)/);
  });

  it('files starting with a dot are ignored (even a non-.html one); any other non-.html file is refused', () => {
    const dir = folder({ '.gitkeep': '', '.draft.html': 'not an article', 'ok.html': source() });
    expect(loadArticles(dir, { now: NOW }).published.map((a) => a.slug)).toEqual(['a-title']);
  });

  it('a malformed file fails and names it; a non-.html source is refused', () => {
    expect(() => loadArticles(folder({ 'ok.html': source(), 'broken.html': source({ title: undefined }, '<p>x</p>') }), { now: NOW })).toThrow(
      /articles\/broken\.html/,
    );
    expect(() => loadArticles(folder({ 'notes.md': '# hi' }), { now: NOW })).toThrow(/articles\/notes\.md: only \.html/);
  });
});

describe('escapeText and formatDate', () => {
  it('escapes markup characters and quotes', () => {
    expect(escapeText(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
  });
  it('formats a date without a locale', () => {
    expect(formatDate('2026-01-05')).toBe('5 January 2026');
    expect(formatDate('2026-12-31')).toBe('31 December 2026');
  });
});

describe('renderArticles', () => {
  const templates = {
    indexTemplate: readFileSync(path.join(SITE_ROOT, 'articles.html'), 'utf8'),
    articleTemplate: readFileSync(path.join(SITE_ROOT, 'article.html'), 'utf8'),
    origin: ORIGIN,
    siteBase: '/formrail/',
  };
  const tricky = {
    ...parseArticle('articles/t.html', source({ title: 'Compare a < b & "c"', slug: 'tricky', description: 'Uses <b> & "quotes".' }, '<pre><code>x &lt; y</code></pre>')),
  };

  it('escapes the title, description and author in the page, the index and the feed', () => {
    const files = renderArticles([tricky], templates);
    const page = files['articles/tricky/index.html'];
    expect(page).toContain('<h1 id="article-title">Compare a &lt; b &amp; &quot;c&quot;</h1>');
    expect(page).toContain('content="Uses &lt;b&gt; &amp; &quot;quotes&quot;."');
    expect(page).not.toContain('Compare a < b');
    expect(files['articles/index.html']).toContain('Compare a &lt; b &amp; &quot;c&quot;');
    expect(files['articles/feed.xml']).toContain('<title>Compare a &lt; b &amp; &quot;c&quot;</title>');
    expect(files['articles/feed.xml']).toContain('<summary>Uses &lt;b&gt; &amp; &quot;quotes&quot;.</summary>');
    expect(files['articles/index.html']).toContain('<p>Uses &lt;b&gt; &amp; &quot;quotes&quot;.</p>');
  });

  it('escapes the author in the page (meta line and article:author), the index and the feed', () => {
    const odd = { ...tricky, slug: 'odd-author', author: 'Ann <b> & "Co"' };
    const files = renderArticles([odd], templates);
    const escaped = 'Ann &lt;b&gt; &amp; &quot;Co&quot;';
    expect(files['articles/odd-author/index.html']).toContain(`</time> · ${escaped}</p>`);
    expect(files['articles/odd-author/index.html']).toContain(`<meta property="article:author" content="${escaped}" />`);
    expect(files['articles/index.html']).toContain(`</time> · ${escaped}</p>`);
    expect(files['articles/feed.xml']).toContain(`<author><name>${escaped}</name></author>`);
    for (const html of [files['articles/odd-author/index.html'], files['articles/index.html']]) expect(html).not.toContain('Ann <b>');
  });

  it('the Atom ids do not depend on the origin or the prefix (hosting-independent tag: URIs)', () => {
    const ids = (origin, siteBase) => {
      const xml = renderArticles([tricky], { ...templates, origin, siteBase })['articles/feed.xml'];
      return [...xml.matchAll(/<id>([^<]*)<\/id>/g)].map((m) => m[1]);
    };
    expect(ids('https://formrail.dev', '/')).toEqual(['tag:formrail.dev,2026:articles', 'tag:formrail.dev,2026:articles/tricky']);
    expect(ids('https://other.example', '/some/prefix/')).toEqual(ids('https://formrail.dev', '/'));
  });

  it('writes an absolute canonical URL from origin + prefix, plus Open Graph and a <time datetime>', () => {
    const page = renderArticles([tricky], templates)['articles/tricky/index.html'];
    expect(page).toContain('<link rel="canonical" href="https://formrail.dev/formrail/articles/tricky/" />');
    expect(page).toContain('<meta property="og:url" content="https://formrail.dev/formrail/articles/tricky/" />');
    expect(page).toContain('<meta property="og:title"');
    expect(page).toContain('<time datetime="2026-11-01">1 November 2026</time>');
    expect(page.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('the canonical URL follows the origin and the prefix (root + path, ticket #667)', () => {
    const page = renderArticles([tricky], { ...templates, origin: 'https://formrail.dev/', siteBase: '/' })['articles/tricky/index.html'];
    expect(page).toContain('href="https://formrail.dev/articles/tricky/"');
  });

  it('keeps <pre><code> in the body and makes each <pre> keyboard-focusable once', () => {
    const page = renderArticles([tricky, { ...tricky, slug: 'two', body: '<pre tabindex="0"><code>y</code></pre>' }], templates);
    expect(page['articles/tricky/index.html']).toContain('<pre tabindex="0"><code>x &lt; y</code></pre>');
    expect(page['articles/two/index.html']).toContain('<pre tabindex="0"><code>y</code></pre>');
    expect(page['articles/two/index.html']).not.toMatch(/tabindex="0" tabindex/);
  });

  it('an unknown placeholder in a template fails naming the template', () => {
    expect(() => renderArticles([tricky], { ...templates, articleTemplate: '<p>{{NOPE}}</p>' })).toThrow(/^article\.html: unknown placeholder \{\{NOPE\}\}/);
    expect(() => renderArticles([tricky], { ...templates, indexTemplate: '{{ITEMS}}{{OTHER}}' })).toThrow(/^articles\.html: unknown placeholder \{\{OTHER\}\}/);
  });

  it('a value cannot inject a placeholder into the template (single pass)', () => {
    const odd = { ...tricky, slug: 'odd', title: '{{BODY}} {{FEED_URL}}' };
    const page = renderArticles([odd], templates)['articles/odd/index.html'];
    expect(page).toContain('<h1 id="article-title">{{BODY}} {{FEED_URL}}</h1>');
  });

  it('the index announces the feed; no page has a script or a third-party URL', () => {
    const files = renderArticles([tricky], templates);
    expect(files['articles/index.html']).toContain('<link rel="alternate" type="application/atom+xml" title="Formrail articles" href="https://formrail.dev/formrail/articles/feed.xml" />');
    for (const [file, html] of Object.entries(files)) {
      if (!file.endsWith('.html')) continue;
      expect(html, file).not.toMatch(/<script|<iframe/);
      const external = [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith(ORIGIN));
      expect([...new Set(external)], file).toEqual(['https://github.com/Utumno1984/formrail']);
    }
  });
});

describe('renderFeed', () => {
  const a = (slug, date) => ({ slug, date, title: `T ${slug}`, author: 'Me & You', description: 'D' });
  const url = (rel) => `${ORIGIN}/${rel}`;

  it('is an Atom feed with one entry per article, absolute links and updated', () => {
    const xml = renderFeed([a('two', '2026-05-02'), a('one', '2026-01-01')], url);
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">')).toBe(true);
    expect(xml).toContain('<id>tag:formrail.dev,2026:articles</id>');
    expect(xml).toContain('<updated>2026-05-02T00:00:00Z</updated>');
    expect(xml.match(/<entry>/g)).toHaveLength(2);
    expect(xml).toContain('<link rel="alternate" type="text/html" href="https://formrail.dev/articles/two/"/>');
    expect(xml).toContain('<author><name>Me &amp; You</name></author>');
    expect(xml.match(/<updated>/g)).toHaveLength(3);
    expect(xml).toContain('<id>tag:formrail.dev,2026:articles/two</id>');
  });

  it('writes the exact updated and published values of each entry and of the feed', () => {
    const xml = renderFeed([a('two', '2026-05-02'), a('one', '2026-01-01')], url);
    expect(xml).toContain('<updated>2026-01-01T00:00:00Z</updated>\n    <published>2026-01-01T00:00:00Z</published>');
    expect(xml).toContain('<updated>2026-05-02T00:00:00Z</updated>\n    <published>2026-05-02T00:00:00Z</published>');
    expect(xml).toContain('href="https://formrail.dev/articles/"/>\n  <updated>2026-05-02T00:00:00Z</updated>\n  <entry>');
  });
});

describe('renderArticlesLinks', () => {
  const html = 'a\n  <!--ARTICLES_START--><li>Articles</li><!--ARTICLES_END-->\nb\n';
  it('keeps the link without markers when there are articles', () => {
    expect(renderArticlesLinks(html, true)).toBe('a\n  <li>Articles</li>\nb\n');
  });
  it('removes the whole line when there are none', () => {
    expect(renderArticlesLinks(html, false)).toBe('a\nb\n');
  });
});

describe('assembleSite with articles', () => {
  const dirs = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function setup(articleFiles) {
    const tmp = mkdtempSync(path.join(tmpdir(), 'assemble-articles-'));
    dirs.push(tmp);
    const storybookDir = path.join(tmp, 'storybook-static');
    mkdirSync(storybookDir, { recursive: true });
    writeFileSync(path.join(storybookDir, 'index.html'), '<!-- manager -->');
    const siteRootDir = path.join(tmp, 'site-root');
    cpSync(SITE_ROOT, siteRootDir, { recursive: true });
    if (articleFiles) {
      mkdirSync(path.join(siteRootDir, 'articles'));
      for (const [name, content] of Object.entries(articleFiles)) writeFileSync(path.join(siteRootDir, 'articles', name), content);
    }
    return { tmp, storybookDir, siteRootDir, outDir: path.join(tmp, 'site') };
  }
  const run = (paths, extra = {}) => assembleSite({ ...paths, now: NOW, log: () => {}, siteOrigin: ORIGIN, siteBase: '/formrail/', ...extra });
  const read = (outDir, file) => readFileSync(path.join(outDir, file), 'utf8');

  it('N sources give articles/, articles/<slug>/ for each and a feed with N entries, and the Articles links appear', () => {
    const paths = setup({ 'one.html': source({ slug: 'one', date: '2026-02-01' }), 'two.html': source({ slug: 'two', date: '2026-03-01' }) });
    run(paths);
    expect(readdirSync(path.join(paths.outDir, 'articles')).sort()).toEqual(['feed.xml', 'index.html', 'one', 'two']);
    const index = read(paths.outDir, 'articles/index.html');
    expect(index.indexOf('two/')).toBeLessThan(index.indexOf('one/'));
    expect(read(paths.outDir, 'articles/feed.xml').match(/<entry>/g)).toHaveLength(2);
    for (const file of ['index.html', 'teams/index.html', 'privacy/index.html']) {
      const html = read(paths.outDir, file);
      expect(html.match(/>Articles<\/a>/g), file).toHaveLength(1); // navigation
      expect(html.match(/>Technical articles<\/a>/g), file).toHaveLength(1); // footer
      expect(html).not.toContain('ARTICLES_START');
    }
    expect(read(paths.outDir, 'index.html')).toContain('href="articles/"');
    expect(read(paths.outDir, 'teams/index.html')).toContain('href="../articles/"');
  });

  it('with zero articles nothing is generated and no Articles link or marker stays (no folder, empty folder, only future articles)', () => {
    for (const files of [null, {}, { 'later.html': source({ date: '2027-01-01' }) }]) {
      const paths = setup(files);
      run(paths);
      expect(existsSync(path.join(paths.outDir, 'articles'))).toBe(false);
      for (const file of ['index.html', 'teams/index.html', 'privacy/index.html']) {
        const html = read(paths.outDir, file);
        expect(html, file).not.toContain('Articles');
        expect(html, file).not.toContain('ARTICLES_');
      }
    }
  });

  it('a future-dated article is reported and left out while the others are published', () => {
    const paths = setup({ 'now.html': source({ slug: 'now' }), 'later.html': source({ slug: 'later', date: '2027-01-01' }) });
    const notes = [];
    run(paths, { log: (m) => notes.push(m) });
    expect(existsSync(path.join(paths.outDir, 'articles', 'now'))).toBe(true);
    expect(existsSync(path.join(paths.outDir, 'articles', 'later'))).toBe(false);
    expect(notes.join('\n')).toMatch(/articles\/later\.html .*2027-01-01.*not published yet/);
  });

  it('a malformed article fails naming the file and leaves the previous output intact', () => {
    const paths = setup({ 'good.html': source(), 'bad.html': source({ title: undefined }) });
    mkdirSync(paths.outDir);
    writeFileSync(path.join(paths.outDir, 'previous.txt'), 'published');
    expect(() => run(paths)).toThrow(/articles\/bad\.html/);
    expect(readFileSync(path.join(paths.outDir, 'previous.txt'), 'utf8')).toBe('published');
  });

  it('a duplicate slug fails the build', () => {
    const paths = setup({ 'a.html': source(), 'b.html': source() });
    expect(() => run(paths)).toThrow(/duplicate slug/);
  });

  it('the published pages are not touched by the article templates (they are not copied)', () => {
    const paths = setup({ 'a.html': source() });
    run(paths);
    expect(existsSync(path.join(paths.outDir, 'article.html'))).toBe(false);
    expect(existsSync(path.join(paths.outDir, 'articles.html'))).toBe(false);
  });
});
