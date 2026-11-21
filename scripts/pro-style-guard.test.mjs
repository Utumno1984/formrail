// #486: the static style guard of packages/pro (scripts/pro-style-guard.mjs).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NAMED_COLOR_LIST, applyAllowlist, checkSource, declaredTokens, runGuard, stripComments } from './pro-style-guard.mjs';

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
    const entry = { file: CSS, rule: 'outline-color', value: '2px solid CanvasText', context: 'outline: 2px solid CanvasText', reason: 'forced-colors: the system colour is the point' };
    expect(applyAllowlist(v, [entry])).toEqual({ violations: [], problems: [] });
  });

  it('an entry without a reason fails the guard (and so does a blank one)', () => {
    for (const reason of [undefined, '', '   ', 'x']) {
      const { problems } = applyAllowlist(v, [{ file: CSS, rule: 'outline-color', value: '2px solid CanvasText', context: 'outline: 2px solid CanvasText', reason }]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/no reason/);
    }
  });

  it('a stale entry (matches nothing) fails the guard', () => {
    const { problems } = applyAllowlist([], [{ file: CSS, rule: 'outline-color', value: 'gone', context: 'gone', reason: 'a long enough reason' }]);
    expect(problems[0]).toMatch(/matches nothing/);
  });
});

describe('pro style guard: allowlist context (#486 round 3)', () => {
  const real = JSON.parse(read('scripts/pro-style-guard.allowlist.json')).find((e) => e.rule === 'named-color');
  const line = '.badge { color: color-mix(in srgb, var(--_cs-tone) 45%, black); }';
  const entry = { file: CSS, rule: 'named-color', value: 'black', context: real.context, reason: 'a long enough reason' };

  it('the real entry still passes on its own line (whitespace-normalised)', () => {
    const v = checkSource(CSS, line.replace(/ /g, '   '), TOKENS);
    expect(applyAllowlist(v, [entry])).toEqual({ violations: [], problems: [] });
  });

  it('a second black in the same file, outside the context, is rejected', () => {
    const v = checkSource(CSS, `${line}\n.a { border: 1px solid black; }`, TOKENS);
    const { violations, problems } = applyAllowlist(v, [entry]);
    expect(problems).toEqual([]);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(2);
  });

  it('one occurrence more than count is rejected, and count raises the cap', () => {
    const v = checkSource(CSS, `${line}\n${line}`, TOKENS);
    const over = applyAllowlist(v, [entry]);
    expect(over.violations).toHaveLength(1);
    expect(over.violations[0].line).toBe(2);
    expect(applyAllowlist(checkSource(CSS, `${line}\n${line}`, TOKENS), [{ ...entry, count: 2 }])).toEqual({ violations: [], problems: [] });
  });

  it('an entry without context is an invalid configuration', () => {
    const noContext = { ...entry, context: undefined };
    const { violations, problems } = applyAllowlist(checkSource(CSS, line, TOKENS), [noContext]);
    expect(problems[0]).toMatch(/context.*required/);
    expect(violations).toHaveLength(1);
  });
});

describe('pro style guard: #486 round 2 (TS style objects, named colours)', () => {
  it.each([
    ['outline in a TS style object', TSX, 'const s = { outline: "2px solid red" };', 'outline-color'],
    ['outlineColor in a TS style object', TSX, 'const s = { outlineColor: "red" };', 'outline-color'],
    ['outline in a template literal', TSX, 'const s = { outline: `2px solid red` };', 'outline-color'],
    ['color: red in a TS style object', TSX, "const s = { color: 'red' };", 'named-color'],
    ['border: 1px solid black', TSX, "const s = { border: '1px solid black' };", 'named-color'],
    ['background-color in CSS', CSS, '.a { background-color: white; }', 'named-color'],
    ['a named colour in a box-shadow', CSS, '.a { box-shadow: 0 0 2px red, 0 0 4px blue; }', 'named-color'],
    ['bg-[red]', TSX, "const c = 'bg-[red] p-4';", 'named-color'],
    ['shadow-[0_0_4px_red]', TSX, "const c = 'shadow-[0_0_4px_red]';", 'named-color'],
    ['fill="red" on a JSX attribute', TSX, 'const a = <svg fill="red" />;', 'named-color'],
    ['color-mix with named colours', CSS, '.a { x: color-mix(in srgb, red 50%, blue); }', 'named-color'],
  ])('rejects %s', (_name, file, source, rule) => {
    expect(rules(file, source)).toContain(rule);
  });

  it('reports every named colour of color-mix', () => {
    const v = checkSource(CSS, '.a { x: color-mix(in srgb, red 50%, blue); }', TOKENS);
    expect(v.map((x) => x.value)).toEqual(['red', 'blue']);
  });

  it.each([
    ['outline in a TS style object with a core token', TSX, 'const s = { outline: "2px solid var(--color-rop-primary)" };'],
    ['outline none / currentColor in a TS style object', TSX, "const s = { outline: 'none', outlineColor: 'currentColor' };"],
    ['whiteSpace: nowrap', TSX, "const s = { whiteSpace: 'nowrap' };"],
    ['white-space: nowrap', CSS, '.a { white-space: nowrap; }'],
    ['a Tailwind palette class', TSX, "const c = 'text-red-500 bg-white';"],
    ['a colour word in prose', TSX, "const t = 'Mark the field red when invalid';"],
    ['colour keywords and tokens', CSS, '.a { color: inherit; background: transparent; border-color: currentColor; fill: var(--color-rop-text); }'],
    ['fill="none" and a token in color-mix', TSX, 'const a = <svg fill="none" style={{ x: "color-mix(in srgb, var(--color-rop-primary) 50%, transparent)" }} />;'],
  ])('accepts %s', (_name, file, source) => {
    expect(checkSource(file, source, TOKENS)).toEqual([]);
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

describe('pro style guard: #486 round 3 (coverage of count, camelCase borders, template literals, case)', () => {
  const line = '.a { border: 1px solid black; }';
  const entry = { file: CSS, rule: 'named-color', value: 'black', context: 'border: 1px solid black', reason: 'a reason long enough' };

  it.each(['all', 0, 1.5, '2'])('an invalid count (%j) is an invalid configuration', (count) => {
    const { problems } = applyAllowlist(checkSource(CSS, line, TOKENS), [{ ...entry, count }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/count.*must be a positive integer/);
  });

  it.each(['borderTopColor', 'borderInlineStartColor', 'borderBlockEndColor'])('%s: red is rejected as a named colour', (prop) => {
    expect(rules(TSX, `const s = { ${prop}: 'red' };`)).toEqual(['named-color']);
  });

  it('named colours inside a template literal are rejected', () => {
    expect(rules(TSX, 'const s = { border: `1px solid black` };')).toEqual(['named-color']);
    expect(rules(TSX, 'const s = { color: `red` };')).toEqual(['named-color']);
  });

  it('named colours are matched case-insensitively', () => {
    expect(rules(CSS, '.a { color: RED; }')).toEqual(['named-color']);
    expect(rules(TSX, "const s = { color: 'Red' };")).toEqual(['named-color']);
  });
});

describe('pro style guard: #614 false negatives', () => {
  it.each([
    ['ternary in a style object', 'const s = { color: err ? "red" : "green" };', ['red', 'green']],
    ['ternary with an identifier head', "const s = { color: err ? tone : 'red' };", ['red']],
    ['&& in a style object', "const s = { color: err && 'red' };", ['red']],
    ['a multi-line ternary', "const s = {\n  color: err\n    ? 'var(--color-rop-error)'\n    : 'orange',\n};", ['orange']],
  ])('TS: %s', (_n, source, values) => {
    expect(checkSource(TSX, source, TOKENS).filter((v) => v.rule === 'named-color').map((v) => v.value)).toEqual(values);
  });

  it('a ternary of tokens is accepted, and the next property is not swept in', () => {
    expect(rules(TSX, "const s = { color: err ? 'var(--color-rop-error)' : 'currentColor', whiteSpace: 'nowrap' };")).toEqual([]);
    expect(rules(TSX, "const s = { color: err ? 'var(--color-rop-error)' : 'inherit', label: 'red' };")).toEqual([]);
  });

  it('a custom property with a named colour is rejected, with file:line', () => {
    const [v] = checkSource(CSS, '.a {\n  --_cs-tone: orange;\n}\n', TOKENS);
    expect(v).toMatchObject({ file: CSS, line: 2, rule: 'named-color', value: 'orange' });
    expect(rules(TSX, "const s = { '--_cs-tone': 'orange' };")).toEqual(['named-color']);
    expect(rules(TSX, "const s = { '--_cs-tone': err ? 'red' : 'var(--color-rop-error)' };")).toEqual(['named-color']);
  });

  it('a custom property with a token or a non-colour is accepted', () => {
    expect(checkSource(CSS, '.a { --_cs-tone: var(--color-rop-error); --_gap: 4px; --_cs-font: inherit; }', TOKENS)).toEqual([]);
  });

  it.each([
    ['text-decoration', CSS, '.a { text-decoration: underline red; }'],
    ['textDecoration', TSX, "const s = { textDecoration: 'underline red' };"],
    ['linear-gradient in background-image', CSS, '.a { background-image: linear-gradient(red, blue); }'],
    ['gradient anywhere (a custom property value)', CSS, '.a { --x: radial-gradient(circle, white, var(--color-rop-border)); }'],
    ['gradient in a Tailwind arbitrary value', TSX, "const c = 'bg-[linear-gradient(to_right,red,blue)]';"],
    ['conic-gradient outside a colour property', CSS, '.a { mask: conic-gradient(red, blue); }'],
    ['drop-shadow()', CSS, '.a { filter: drop-shadow(0 0 2px red); }'],
  ])('rejects %s', (_n, file, source) => {
    expect(rules(file, source)).toContain('named-color');
  });

  it('text-decoration with a token or a plain style is accepted', () => {
    expect(checkSource(CSS, '.a { text-decoration: underline; text-decoration-color: currentColor; }', TOKENS)).toEqual([]);
    expect(checkSource(CSS, '.a { background-image: linear-gradient(var(--color-rop-border), transparent); }', TOKENS)).toEqual([]);
  });

  it('outline with an identifier is ignored, with a ternary only its literals are judged', () => {
    expect(rules(TSX, 'const s = { outline: ring };')).toEqual([]);
    expect(rules(TSX, "const s = { outline: f ? 'var(--color-rop-primary)' : 'none' };")).toEqual([]);
    const v = checkSource(TSX, "const s = { outline: f ? '2px solid red' : 'none' };", TOKENS).filter((x) => x.rule === 'outline-color');
    expect(v.map((x) => x.value)).toEqual(['2px solid red']);
    expect(v[0].message).not.toMatch(/"f \?"/);
  });

  it('outline: red as a bare word is still rejected', () => {
    expect(rules(TSX, 'const s = { outline: red };')).toContain('outline-color');
  });
});

describe('pro style guard: #614 coverage (name list, one test per colour property)', () => {
  it('the list of colour names is the full CSS list (148, no duplicates)', () => {
    expect(NAMED_COLOR_LIST).toHaveLength(148);
    expect(new Set(NAMED_COLOR_LIST).size).toBe(148);
  });

  it.each([
    'aliceblue', 'aqua', 'black', 'blueviolet', 'chartreuse', 'cornflowerblue', 'darkgrey', 'darkslategrey', 'deepskyblue', 'dimgrey',
    'fuchsia', 'gainsboro', 'goldenrod', 'greenyellow', 'hotpink', 'indigo', 'khaki', 'lightgoldenrodyellow', 'lime', 'maroon',
    'mediumvioletred', 'navy', 'olivedrab', 'papayawhip', 'rebeccapurple', 'rosybrown', 'seashell', 'sienna', 'snow', 'tan', 'thistle',
    'whitesmoke', 'yellowgreen',
  ])('the name %s is a colour', (name) => {
    expect(rules(CSS, `.a { color: ${name}; }`)).toEqual(['named-color']);
  });

  const KEBAB = [
    'color', 'background', 'background-color', 'background-image', 'box-shadow', 'text-shadow', 'text-decoration', 'text-decoration-color',
    'caret-color', 'accent-color', 'fill', 'stroke', 'column-rule', 'column-rule-color', 'stop-color', 'flood-color', 'lighting-color',
    'scrollbar-color', 'text-emphasis', 'text-emphasis-color', '-webkit-text-stroke', '-webkit-text-stroke-color',
    '-webkit-text-fill-color', '-webkit-tap-highlight-color', 'border', 'border-color', 'border-top-color', 'border-inline-start-color',
    'border-block-end-color', 'border-start-start-color',
  ];
  it.each(KEBAB)('CSS %s carries a colour', (prop) => {
    expect(rules(CSS, `.a { ${prop}: red; }`)).toEqual(['named-color']);
  });

  const CAMEL = [
    'color', 'background', 'backgroundColor', 'backgroundImage', 'boxShadow', 'textShadow', 'textDecoration', 'textDecorationColor',
    'caretColor', 'accentColor', 'fill', 'stroke', 'columnRule', 'columnRuleColor', 'stopColor', 'floodColor', 'lightingColor',
    'scrollbarColor', 'textEmphasis', 'textEmphasisColor', 'WebkitTextStroke', 'webkitTextStrokeColor', 'WebkitTextFillColor',
    'WebkitTapHighlightColor', 'border', 'borderColor', 'borderTopColor', 'borderInlineStartColor',
  ];
  it.each(CAMEL)('TS %s carries a colour', (prop) => {
    expect(rules(TSX, `const s = { ${prop}: 'red' };`)).toEqual(['named-color']);
  });
});
