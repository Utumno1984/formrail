import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleSite } from './assemble-site.mjs';
import { SITE_ORIGIN } from './site-config.mjs';

// "No checkout" guard (ticket #715). Decision of Daniele of 2026-11-26 (evening): the sale is on standby, so
// no page of the published site may contain a payment link, button or script. This test fails the CI if one
// appears. It is to be REMOVED OR LOOSENED ONLY in the ticket that reopens the sale, on explicit instruction
// of Daniele (see "Decisione del 2026-11-26 (sera): vendita in standby" in docs/planning/design-system-spec.md,
// section 8). Do not add exceptions to make a page pass.
//
// It reads the assembled site (in a temporary folder, as the other site tests do): every HTML page except the
// Storybook builds (`storybook/`, `pro/`).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_HOST = new URL(SITE_ORIGIN).hostname;
// The only Paddle URLs allowed: the exact legal links already present in the legal pages (ticket #692).
const PADDLE_LEGAL_URLS = [
  'https://www.paddle.com/legal/buyer-terms',
  'https://www.paddle.com/legal/privacy',
  'https://paddle.net/',
];
const PAYMENT_WORDS = /\b(buy|purchase|checkout|pre-?order|pay now|subscribe)\b/i;
const PADDLE_HOST = /(^|\.)paddle\.(com|io|net)$/i;

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'" };
const decode = (s) => s.replace(/&(amp|quot|lt|gt|#39);/g, (e) => ENTITIES[e]);
const visibleText = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3]) : null;
};

function hrefProblems(page, href, shown) {
  const problems = [];
  if (/[?&]_ptxn(=|&|$)/i.test(href)) problems.push(`${page}: link with the _ptxn parameter "${href}": ${shown}`);
  let url;
  try {
    url = new URL(href, `${SITE_ORIGIN}/`);
  } catch {
    return problems;
  }
  if (/\/teams\/buy(\/|\.html)?$/i.test(url.pathname)) problems.push(`${page}: link to the purchase page "${href}": ${shown}`);
  if (PADDLE_HOST.test(url.hostname) && !PADDLE_LEGAL_URLS.includes(href)) {
    problems.push(`${page}: link to Paddle outside the allowed legal URLs "${href}": ${shown}`);
  }
  return problems;
}

/** Problems found in one page: each message names the page and the offending element. */
export function findCheckoutProblems(page, html) {
  const problems = [];
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of source.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const [element, tagName, attrs, inner] = m;
    const tag = `<${tagName}${attrs}>`;
    const shown = element.slice(0, 120);
    for (const [kind, value] of [
      ['text', visibleText(inner)],
      ['aria-label', attr(tag, 'aria-label') ?? ''],
    ]) {
      if (PAYMENT_WORDS.test(value)) problems.push(`${page}: <${tagName.toLowerCase()}> with payment ${kind} "${value}": ${shown}`);
    }
    const href = tagName.toLowerCase() === 'a' ? attr(tag, 'href') : null;
    if (href !== null) problems.push(...hrefProblems(page, href, shown));
  }
  for (const m of source.matchAll(/<script\b([^>]*)>/gi)) {
    const src = attr(m[0], 'src');
    if (src === null) continue;
    const host = /^(https?:)?\/\//i.test(src) ? new URL(src, 'https://x.invalid').hostname : null;
    if (host !== null && host !== SITE_HOST) problems.push(`${page}: <script> from another host "${src}": ${m[0]}`);
  }
  return problems;
}

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function assemble(options) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'no-checkout-'));
  dirs.push(tmp);
  const storybookDir = path.join(tmp, 'storybook-static');
  mkdirSync(storybookDir);
  // a Storybook page full of payment links must be ignored by the scan
  writeFileSync(path.join(storybookDir, 'index.html'), '<a href="https://buy.paddle.com/x">Buy now</a>');
  const outDir = path.join(tmp, 'site');
  assembleSite({ storybookDir, outDir, log: () => {}, ...options });
  return outDir;
}

/** [relative path, html] of every page of the site except the Storybook builds. */
function pagesOf(outDir) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(outDir, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (rel !== 'storybook' && rel !== 'pro') walk(full);
      } else if (entry.name.endsWith('.html')) found.push([rel, readFileSync(full, 'utf8')]);
    }
  };
  walk(outDir);
  return found;
}

const problemsOf = (outDir) => pagesOf(outDir).flatMap(([name, html]) => findCheckoutProblems(name, html));

describe('the guard itself (fixture pages)', () => {
  const fail = (html, expected) => {
    const problems = findCheckoutProblems('fixture.html', html);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain('fixture.html');
    expect(problems[0]).toContain(expected);
  };

  it('fails on a Paddle checkout link', () => fail('<a href="https://buy.paddle.com/x">Buy now</a>', 'buy.paddle.com'));
  it('fails on a "Pre-order" button', () => fail('<button>Pre-order</button>', '<button>'));
  it('fails on a Paddle.js script', () =>
    fail('<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>', 'cdn.paddle.com/paddle/v2/paddle.js'));
  it('fails on a link to /teams/buy/ even with a neutral text', () => fail('<a href="/teams/buy/">Get it</a>', '/teams/buy/'));
  it('fails on /teams/buy under a site base, without the trailing slash, or absolute', () => {
    fail('<a href="/formrail/teams/buy">Get it</a>', '/teams/buy');
    fail(`<a href="${SITE_ORIGIN}/teams/buy">Get it</a>`, '/teams/buy');
  });
  it('fails on an aria-label that says Buy with a neutral visible text', () =>
    fail('<a href="/x/" aria-label="Buy Formrail Pro">Learn more</a>', 'aria-label'));
  it('fails on the _ptxn parameter, also on the site domain', () => {
    fail(`<a href="${SITE_ORIGIN}/pay/?_ptxn=txn_1">Continue</a>`, '_ptxn');
    fail('<a href="/pay/?a=1&amp;_ptxn=txn_1">Continue</a>', '_ptxn');
  });
  it.each(['Purchase', 'Checkout', 'Preorder', 'Pre-order now', 'Pay now', 'Subscribe', 'BUY'])('fails on the word "%s"', (word) =>
    fail(`<button type="button">${word}</button>`, word),
  );
  it('fails on any Paddle URL that is not exactly an allowed one', () => {
    fail('<a href="https://www.paddle.com/legal/other">Terms</a>', 'legal/other');
    fail('<a href="https://www.paddle.com/legal/buyer-terms/extra">Terms</a>', 'buyer-terms/extra');
    fail('<a href="https://paddle.net/pay">Support</a>', 'paddle.net/pay');
    fail('<a href="https://checkout.paddle.io/x">Support</a>', 'paddle.io');
  });
  it('fails on a script from another host, also protocol-relative, and passes on a local one', () => {
    fail('<script src="//cdn.example.com/a.js"></script>', 'cdn.example.com');
    expect(findCheckoutProblems('p.html', '<script src="/copy.js"></script>')).toEqual([]);
    expect(findCheckoutProblems('p.html', `<script src="${SITE_ORIGIN}/copy.js"></script>`)).toEqual([]);
  });

  it('passes on the legal prose and the allowed legal links', () => {
    const html = `
      <p>For each license you buy, see Paddle's buyer support page and the purchase data.</p>
      <a href="https://paddle.net/">Paddle's buyer support page</a>
      <a href="https://www.paddle.com/legal/buyer-terms" rel="noopener">Paddle's Buyer Terms</a>
      <a href="https://www.paddle.com/legal/privacy">Paddle's privacy notice</a>
      <!-- <a href="/teams/buy/">Buy</a> -->`;
    expect(findCheckoutProblems('legal.html', html)).toEqual([]);
  });
  it('matches whole words only: "buyer" is not "buy"', () => {
    expect(findCheckoutProblems('p.html', '<a href="/refund/">Buyers and subscribers</a><button>Prepurchased</button>')).toEqual([]);
  });
});

describe('every page of the assembled site', () => {
  it('has no payment link, button or script, and the Storybook builds are not scanned', () => {
    const outDir = assemble();
    const names = pagesOf(outDir).map(([name]) => name);
    for (const expected of ['index.html', 'teams/index.html', 'privacy/index.html', 'license/index.html', 'refund/index.html', '404.html', 'iframe.html']) {
      expect(names).toContain(expected);
    }
    expect(names.some((n) => n.startsWith('storybook/') || n.startsWith('pro/'))).toBe(false);
    expect(problemsOf(outDir)).toEqual([]);
  });

  it('also covers the article pages (index and one page per article)', () => {
    const outDir = assemble({ articlesDir: path.join(ROOT, 'e2e', 'site', 'fixtures', 'articles'), now: new Date('2030-01-01') });
    const names = pagesOf(outDir).map(([name]) => name);
    expect(names).toContain('articles/index.html');
    expect(names.filter((n) => /^articles\/[^/]+\/index\.html$/.test(n)).length).toBeGreaterThan(0);
    expect(problemsOf(outDir)).toEqual([]);
  });

  it('passes with no article published', () => {
    const outDir = assemble({ articlesDir: path.join(tmpdir(), 'no-such-articles-dir') });
    expect(pagesOf(outDir).map(([name]) => name)).not.toContain('articles/index.html');
    expect(problemsOf(outDir)).toEqual([]);
  });

  it('passes with the early access and design partner URLs empty (fewer links, not more)', () => {
    expect(problemsOf(assemble({ earlyAccessUrl: '', designPartnerUrl: '' }))).toEqual([]);
  });

  it('contains exactly the three allowed Paddle URLs and no other Paddle address', () => {
    const urls = new Set();
    for (const [, html] of pagesOf(assemble())) {
      for (const m of html.matchAll(/https?:\/\/[^\s"'<>)]*paddle\.[^\s"'<>)]*/gi)) urls.add(m[0]);
    }
    expect([...urls].sort()).toEqual([...PADDLE_LEGAL_URLS].sort());
  });
});
