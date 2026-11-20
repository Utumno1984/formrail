// #486: the static style guard of packages/pro (scripts/pro-style-guard.mjs).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyAllowlist, checkSource, declaredTokens, runGuard, stripComments } from './pro-style-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const TOKENS = declaredTokens(read('packages/core/src/styles/tokens.css'));
const CSS = 'packages/pro/src/styles/index.css';
const TSX = 'packages/pro/src/x/Thing.tsx';

const rules = (file, source) => checkSource(file, source, TOKENS).map((v) => v.rule);

describe('pro style guard: what is rejected', () => {
  it.each([
    ['#fff', CSS, '.a { color: #fff; }', 'color-literal'],
    ['hex8', CSS, '.a { color: #11223344; }', 'color-literal'],
    ['rgb()', CSS, '.a { color: rgb(1 2 3); }', 'color-literal'],
    ['hsl()', CSS, '.a { color: hsl(10 20% 30%); }', 'color-literal'],
    ['oklch()', CSS, '.a { color: oklch(0.5 0.1 20); }', 'color-literal'],
    ['hex in TSX', TSX, "const s = { color: '#abc' };", 'color-literal'],
    ['border-radius: 4px', CSS, '.a { border-radius: 4px; }', 'radius-literal'],
    ['borderRadius in TSX', TSX, 'const s = { borderRadius: 6 };', 'radius-literal'],
    ['rounded-[6px]', TSX, "const c = 'rounded-[6px] p-4';", 'radius-literal'],
    ['outline: 2px solid red', CSS, '.a { outline: 2px solid red; }', 'outline-color'],
    ['outline in an arbitrary class', TSX, "const c = 'focus-visible:[outline:2px_solid_red]';", 'outline-color'],
    ['outline with a hex colour', CSS, '.a { outline: 1px solid #000; }', 'color-literal'],
    ['p-[13px]', TSX, "const c = 'p-[13px]';", 'spacing-literal'],
    ['a core token that does not exist', CSS, '.a { color: var(--color-rop-nope); }', 'unknown-token'],
    ['a radius token that does not exist', CSS, '.a { border-radius: var(--radius-rop-nope); }', 'unknown-token'],
  ])('%s', (_name, file, source, rule) => {
    expect(rules(file, source)).toContain(rule);
  });

  it('reports file:line of the violation', () => {
    const [v] = checkSource(CSS, '.a {\n  margin: 0;\n  color: #123456;\n}\n', TOKENS);
    expect(v).toMatchObject({ file: CSS, line: 3, rule: 'color-literal' });
  });

  it('every rule message names the rule broken', () => {
    const messages = checkSource(CSS, '.a { color: #fff; border-radius: 4px; outline: 2px solid red; }', TOKENS).map((v) => v.message);
    expect(messages).toHaveLength(3);
  });
});

describe('pro style guard: #486 round 1 (all-digit colours, strings)', () => {
  it.each(['#000000', '#111', '#123456', '#12345678'])('rejects the colour %s in a .tsx string', (hex) => {
    expect(rules(TSX, `const c = "${hex}";`)).toEqual(['color-literal']);
  });

  it('does not ignore strings: a colour inside a style string or template is rejected', () => {
    expect(rules(TSX, "const s = 'border: 1px solid #abc';")).toEqual(['color-literal']);
    expect(rules(TSX, 'const s = `color: ${x}; background: #123456`;')).toEqual(['color-literal']);
  });

  it('an issue reference named by prose stays accepted, a bare quoted number does not', () => {
    expect(rules(TSX, "const t = 'fixes #486';")).toEqual([]);
    expect(rules(TSX, "const t = '#486';")).toEqual(['color-literal']);
  });
});

describe('pro style guard: what is accepted', () => {
  it.each([
    ['core tokens in var()', CSS, '.a { border: 1px solid var(--color-rop-border); color: var(--color-rop-text); }'],
    ['rounded-rop-md in @apply', CSS, '.a { @apply rounded-rop-md bg-rop-surface p-4 gap-3; }'],
    ['a radius token', CSS, '.a { border-radius: var(--radius-rop-md); }'],
    ['inherit radius', CSS, '.a { border-radius: inherit; }'],
    ['the focus ring', CSS, '.a { outline: 2px solid var(--color-rop-primary); outline-offset: 2px; }'],
    ['currentColor outline', CSS, '.a { outline: 1px solid currentColor; outline-offset: -1px; }'],
    ['outline none / transparent', CSS, '.a { outline: none; } .b { outline: 2px solid transparent; }'],
    ['the Tailwind scale', TSX, "const c = 'p-4 gap-3 pt-3 -mt-2';"],
    ['an issue number in text', TSX, "const t = 'see ticket #470';"],
    ['an arbitrary non-spacing value', CSS, '.a { @apply top-[0.2em] [overflow-wrap:anywhere]; }'],
  ])('%s', (_name, file, source) => {
    expect(checkSource(file, source, TOKENS)).toEqual([]);
  });

  it('ignores comments (CSS and TS) and keeps line numbers', () => {
    const css = '/* color: #fff; border-radius: 4px; outline: 2px solid red */\n.a { color: var(--color-rop-text); }\n';
    expect(checkSource(CSS, css, TOKENS)).toEqual([]);
    const ts = "// rounded-[6px] #fff\n/** p-[13px] */\nconst a = 1; // rgb(0 0 0)\nconst b = '#zzz';\n";
    expect(checkSource(TSX, ts, TOKENS)).toEqual([]);
    expect(stripComments('a\n/* x\ny */\nb', 'css').split('\n')).toHaveLength(4);
  });

  it('does not take "//" inside a string for a comment', () => {
    const v = checkSource(TSX, "const u = 'https://x.test'; const c = 'rounded-[6px]';", TOKENS);
    expect(v.map((x) => x.rule)).toEqual(['radius-literal']);
  });
});

describe('pro style guard: allowlist', () => {
  const v = checkSource(CSS, '.a { outline: 2px solid CanvasText; }', TOKENS);

  it('an entry with a reason lets the exception through', () => {
    const entry = { file: CSS, rule: 'outline-color', value: '2px solid CanvasText', reason: 'forced-colors: the system colour is the point' };
    expect(applyAllowlist(v, [entry])).toEqual({ violations: [], problems: [] });
  });

  it('an entry without a reason fails the guard (and so does a blank one)', () => {
    for (const reason of [undefined, '', '   ', 'x']) {
      const { problems } = applyAllowlist(v, [{ file: CSS, rule: 'outline-color', value: '2px solid CanvasText', reason }]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/no reason/);
    }
  });

  it('a stale entry (matches nothing) fails the guard', () => {
    const { problems } = applyAllowlist([], [{ file: CSS, rule: 'outline-color', value: 'gone', reason: 'a long enough reason' }]);
    expect(problems[0]).toMatch(/matches nothing/);
  });
});

describe('pro style guard: the repository', () => {
  it('packages/pro/src is clean (with the versioned allowlist)', () => {
    expect(runGuard()).toEqual([]);
  });

  it('every allowlist entry says why', () => {
    for (const e of JSON.parse(read('scripts/pro-style-guard.allowlist.json'))) {
      expect(e.reason?.trim().length).toBeGreaterThanOrEqual(10);
    }
  });

  it('the core tokens the Pro stylesheet relies on are declared', () => {
    for (const name of ['--color-rop-border', '--color-rop-primary', '--color-rop-surface', '--color-rop-success', '--color-rop-error']) {
      expect(TOKENS.has(name), name).toBe(true);
    }
  });
});

describe('focus ring: the Pro RebaseNotice uses the very value of the core', () => {
  // The core spells the ring as a Tailwind arbitrary declaration (13 sites), Pro as plain CSS: both normalised to
  // { width, style, colour, offset } and compared. A new shared token was not justified by the audit (it would
  // touch every core component for no visible change), so this test is the single source of truth check.
  const coreButton = read('packages/core/src/button/Button.tsx');
  const core = {
    ring: /focus-visible:\[outline:(\d+px)_(\w+)_(var\(--[\w-]+\))\]/.exec(coreButton),
    offset: /focus-visible:outline-offset-(\d+)\b/.exec(coreButton),
  };
  const proCss = stripComments(read(CSS), 'css');
  const block = /\.rop-pro-rebase-notice\s*\{[\s\S]*?&:focus-visible\s*\{([^}]*)\}/.exec(proCss);

  it('both are found', () => {
    expect(core.ring).not.toBeNull();
    expect(core.offset).not.toBeNull();
    expect(block).not.toBeNull();
  });

  it('same width, style, colour token and offset', () => {
    const pro = /outline:\s*(\d+px)\s+(\w+)\s+(var\(--[\w-]+\))\s*;\s*outline-offset:\s*(\d+)px/.exec(block[1]);
    expect(pro).not.toBeNull();
    expect([pro[1], pro[2], pro[3], pro[4]]).toEqual([core.ring[1], core.ring[2], core.ring[3], `${Number(core.offset[1])}`]);
  });
});
