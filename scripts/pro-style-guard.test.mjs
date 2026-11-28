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

describe('pro style guard: #614 round 2 (TS values read on the AST, whatever the formatting)', () => {
  // [value, line] of each named-color violation: the line is the one of the literal, not of the key.
  const named = (source) => checkSource(TSX, source, TOKENS).filter((v) => v.rule === 'named-color').map((v) => [v.value, v.line]);

  it.each([
    ['&& inline', "const s = { color: ok && 'red' };", [['red', 1]]],
    ['&& at the end of the line (Prettier)', "const s = {\n  color: ok &&\n    'red',\n};", [['red', 3]]],
    ['|| at the end of the line (Prettier)', "const s = {\n  color: tone ||\n    'red',\n};", [['red', 3]]],
    ['?? at the end of the line (Prettier)', "const s = {\n  color: tone ??\n    'red',\n};", [['red', 3]]],
    ['&& in a long Prettier chain', "const s = {\n  color:\n    isError &&\n    isTouched &&\n    'red',\n};", [['red', 5]]],
  ])('case 1, %s', (_n, source, expected) => {
    expect(named(source)).toEqual(expected);
  });

  it.each([
    ['? and : at the end of the line', "const s = {\n  color: ok ?\n    'red' :\n    'green',\n};", [['red', 3], ['green', 4]]],
    ['? and : at the start of the line (Prettier default)', "const s = {\n  color: ok\n    ? 'red'\n    : 'green',\n};", [['red', 3], ['green', 4]]],
    ['experimental ternaries (Prettier --experimental-ternaries)', "const s = {\n  color:\n    ok ? 'red'\n    : 'green',\n};", [['red', 3], ['green', 4]]],
  ])('case 2, %s', (_n, source, expected) => {
    expect(named(source)).toEqual(expected);
  });

  it.each([
    ["['--x']", "const s = { ['--x']: 'red' };", [['red', 1]]],
    ['[`--x`]', "const s = { [`--x`]: 'red' };", [['red', 1]]],
    ["['--x'] with a ternary", "const s = { ['--x']: err ? 'red' : 'blue' };", [['red', 1], ['blue', 1]]],
    ["['--x'] (Prettier)", "const s = {\n  ['--x']:\n    err ?\n      'red'\n    : 'blue',\n};", [['red', 4], ['blue', 5]]],
    ["['backgroundColor'] and a quoted kebab key", "const s = { ['backgroundColor']: 'red', 'border-top-color': 'blue' };", [['red', 1], ['blue', 1]]],
  ])('case 3, a computed key: %s', (_n, source, expected) => {
    expect(named(source)).toEqual(expected);
  });

  it.each([
    ['with parentheses', "const s = { color: err ? (x ? 'red' : 'blue') : 'green' };", [['red', 1], ['blue', 1], ['green', 1]]],
    ['as Prettier writes it (parentheses dropped)', "const s = {\n  color: err\n    ? x\n      ? 'red'\n      : 'blue'\n    : 'green',\n};", [['red', 4], ['blue', 5], ['green', 6]]],
    ['nested in the false branch', "const s = { color: err ? 'green' : (x ? 'red' : 'blue') };", [['green', 1], ['red', 1], ['blue', 1]]],
  ])('case 4, a nested ternary %s', (_n, source, expected) => {
    expect(named(source)).toEqual(expected);
  });

  it('the condition of a ternary and an identifier are not values', () => {
    expect(rules(TSX, "const s = { color: tone === 'red' ? 'var(--color-rop-error)' : 'inherit' };")).toEqual([]);
    expect(rules(TSX, "const s = { color: red ? 'var(--color-rop-error)' : 'inherit' };")).toEqual([]);
    expect(rules(TSX, "const s = {\n  color: ok &&\n    tone,\n  background: ok ?\n    theme.red :\n    fallback,\n};")).toEqual([]);
    expect(rules(TSX, 'const s = { color: theme.red, borderColor: palette.white };')).toEqual([]);
  });

  it('a bare identifier that spells a colour is still one', () => {
    expect(named('const s = { color: red };')).toEqual([['red', 1]]);
  });

  it('the next property is not swept in, whatever the formatting', () => {
    expect(rules(TSX, "const s = {\n  color: ok ?\n    'var(--color-rop-error)' :\n    'inherit',\n  label: 'red',\n};")).toEqual([]);
  });

  it('a value map, a cast, a helper call and a template substitution are read too', () => {
    expect(named("const s = { color: { error: 'red', ok: 'var(--color-rop-success)' }[tone] };")).toEqual([['red', 1]]);
    expect(named("const s = { color: ('red' as const) };")).toEqual([['red', 1]]);
    expect(named("const s = { color: tone(\n  'red',\n) };")).toEqual([['red', 2]]);
    expect(named("const s = { border: `1px solid ${err ? 'red' : tone}` };")).toEqual([['red', 1]]);
  });

  it('var(--x, red) is still rejected', () => {
    expect(named("const s = { color: 'var(--x, red)' };")).toEqual([['red', 1]]);
  });

  it('fill/stroke on a JSX element, with a multi-line expression', () => {
    expect(named('const a = (\n  <svg\n    fill={\n      err ?\n        "red"\n      : "none"\n    }\n  />\n);')).toEqual([['red', 5]]);
  });

  it('outline: only the literals of every branch are judged, whatever the formatting', () => {
    const outline = (source) => checkSource(TSX, source, TOKENS).filter((v) => v.rule === 'outline-color').map((v) => [v.value, v.line]);
    expect(outline("const s = {\n  outline: f\n    ? '2px solid red'\n    : 'none',\n};")).toEqual([['2px solid red', 3]]);
    expect(outline("const s = {\n  outline: f ?\n    '2px solid var(--color-rop-primary)' :\n    'none',\n};")).toEqual([]);
    expect(outline("const s = {\n  ['outlineColor']:\n    f && 'red',\n};")).toEqual([['red', 3]]);
  });
});

describe('pro style guard: #614 round 3 (casts in a computed key, unrecognised value forms)', () => {
  const named = (file, source) => checkSource(file, source, TOKENS).filter((v) => v.rule === 'named-color').map((v) => [v.value, v.line]);
  const outline = (source) => checkSource(TSX, source, TOKENS).filter((v) => v.rule === 'outline-color').map((v) => [v.value, v.line]);
  const TS = 'packages/pro/src/x/thing.ts';

  it.each([
    ['as string (the Toast.stories form)', "const s = { ['--_cs-tone' as string]: 'orange' };", [['orange', 1]]],
    ['as any', "const s = { ['--x' as any]: 'red' };", [['red', 1]]],
    ['as keyof React.CSSProperties', "const s = { ['color' as keyof React.CSSProperties]: 'red' };", [['red', 1]]],
    ['as const', "const s = { ['color' as const]: 'red' };", [['red', 1]]],
    ['satisfies', "const s = { ['--x' satisfies string]: 'red' };", [['red', 1]]],
    ['non-null', "const s = { ['backgroundColor'!]: 'red' };", [['red', 1]]],
    ['nested: parentheses, as, satisfies and !', "const s = { [(('--x' as string) satisfies string)!]: 'red' };", [['red', 1]]],
    ['as string with a ternary (Prettier)', "const s = {\n  ['--_cs-tone' as string]:\n    err ?\n      'red'\n    : 'blue',\n};", [['red', 4], ['blue', 5]]],
    ['as string with a ternary (Prettier default)', "const s = {\n  ['--x' as string]: err\n    ? 'red'\n    : 'blue',\n};", [['red', 3], ['blue', 4]]],
  ])('case 1, a computed key with a cast: %s', (_n, source, expected) => {
    expect(named(TSX, source)).toEqual(expected);
  });

  it('case 1, a <T> type assertion in the key (.ts)', () => {
    expect(named(TS, "const s = { [<string>'--x']: 'red' };")).toEqual([['red', 1]]);
  });

  it('case 1, an outline key with a cast is judged on its value', () => {
    expect(outline("const s = { ['outlineColor' as const]: 'red' };")).toEqual([['red', 1]]);
    expect(outline("const s = { ['outline' as string]: '2px solid var(--color-rop-primary)' };")).toEqual([]);
  });

  it('case 1, a cast key that does not carry a colour, or a value that is no literal, is not reported', () => {
    expect(rules(TSX, "const s = { ['label' as string]: 'red' };")).toEqual([]);
    expect(rules(TSX, "const s = { ['--rop-slot-index' as string]: i, bottom: 'auto' };")).toEqual([]);
  });

  it.each([
    ['.trim()', "const s = { color: 'red'.trim() };", [['red', 1]]],
    ['a method chain', "const s = { color: ' Red '.trim().toLowerCase() };", [['red', 1]]],
    ['a method on a ternary', "const s = { color: (err ? 'red' : 'blue').trim() };", [['red', 1], ['blue', 1]]],
    ['an arrow callback with an expression body', "const c = { color: (row) => (row.overdue ? 'red' : undefined) };", [['red', 1]]],
    ['an arrow callback with an expression body (Prettier)', "const c = {\n  color: (row) =>\n    row.overdue ?\n      'red'\n    : undefined,\n};", [['red', 4]]],
    ['an arrow callback with a block body', "const c = {\n  color: (row) => {\n    if (row.overdue) {\n      return 'red';\n    }\n    return 'var(--color-rop-text)';\n  },\n};", [['red', 4]]],
    ['a function expression', "const c = { color: function (row) { return row.overdue ? 'red' : 'inherit'; } };", [['red', 1]]],
    ['a literal held in a local of the block', "const c = {\n  color: (row) => {\n    const tone = 'red';\n    return row.overdue ? tone : undefined;\n  },\n};", [['red', 3]]],
    ['a default parameter', "const c = { color: (tone = 'red') => tone };", [['red', 1]]],
    ['await and an assignment', "const c = { color: async () => await load('red'), background: (last = 'blue') };", [['red', 1], ['blue', 1]]],
    ['an object method', "const c = { color: { pick() { return 'red'; } }.pick() };", [['red', 1]]],
  ])('case 2, an unrecognised value form still has its literals judged: %s', (_n, source, expected) => {
    expect(named(TSX, source)).toEqual(expected);
  });

  it('case 2, an outline callback is judged on its literals', () => {
    expect(outline("const c = { outline: (f) => (f ? '2px solid red' : 'none') };")).toEqual([['2px solid red', 1]]);
    expect(outline('const c = { outline: (f) => focusRing(f, 2) };')).toEqual([]);
  });

  it.each([
    ['the condition of a ternary in a callback', "const c = { color: (row) => (row.tone === 'red' ? 'var(--color-rop-error)' : 'inherit') };"],
    ['if/while/for conditions in a block', "const c = {\n  color: (row) => {\n    if (row.tags.includes('red')) return 'var(--color-rop-error)';\n    while (is(row, 'white')) row = row.next;\n    do row = row.next; while (is(row, 'gray'));\n    for (let i = 0; is(row, 'black'); i++) row = row.next;\n    return 'inherit';\n  },\n};"],
    ['switch/case conditions in a block', "const c = {\n  color: (row) => {\n    switch (row.tone) {\n      case 'red':\n        return 'var(--color-rop-error)';\n      default:\n        return 'inherit';\n    }\n  },\n};"],
    ['identifiers below a callback or a property access', 'const c = { color: (red) => red, background: (row) => row.white, borderColor: theme.red.trim() };'],
    ['a callee, and an identifier receiver of a method', 'const c = { color: red(tone), background: palette.white.toString(), borderColor: white.trim() };'],
    ['the types of a callback', "const c = { color: <T extends 'red'>(row: { kind: 'white' }): Tone<'black'> => pick<T>(row) };"],
  ])('case 2, what does not fire: %s', (_n, source) => {
    expect(rules(TSX, source)).toEqual([]);
  });
});

describe('pro style guard: #614 code review round 1 (real JSX, +, comma, outline templates, IIFE)', () => {
  const named = (file, source) => checkSource(file, source, TOKENS).filter((v) => v.rule === 'named-color').map((v) => [v.value, v.line]);
  const outline = (source) => checkSource(TSX, source, TOKENS).filter((v) => v.rule === 'outline-color').map((v) => [v.value, v.line]);

  // A real component, as Prettier formats it: the AST must be parsed as TSX, or the JSX is a syntax error and the style
  // object is never seen.
  const COMPONENT = [
    "import type { ReactNode } from 'react';", // 1
    '', // 2
    'export function Badge({ ok, err, on, children }: { ok: boolean; err: boolean; on: boolean; children: ReactNode }) {', // 3
    '  return (', // 4
    '    <div', // 5
    '      className="inline-flex items-center"', // 6
    '      style={{', // 7
    '        color: ok', // 8
    "          ? 'red'", // 9
    "          : 'blue',", // 10
    '        background:', // 11
    '          err &&', // 12
    "          'green',", // 13
    '      }}', // 14
    '    >', // 15
    '      <svg', // 16
    '        aria-hidden', // 17
    '        fill={', // 18
    '          on ?', // 19
    "            'orange'", // 20
    "          : 'none'", // 21
    '        }', // 22
    '      />', // 23
    '      <span>{children}</span>', // 24
    '    </div>', // 25
    '  );', // 26
    '}', // 27
  ].join('\n');

  it('point 1, a multi-line style={{...}} with a ternary and && in a real .tsx component', () => {
    expect(named(TSX, COMPONENT)).toEqual([['red', 9], ['blue', 10], ['green', 13], ['orange', 20]]);
  });

  it('point 1, a multi-line fill={...} inside a real .tsx component', () => {
    const svg = [
      'export const Dot = ({ on }: { on: boolean }) => (', // 1
      '  <svg viewBox="0 0 8 8">', // 2
      '    <circle', // 3
      '      cx={4}', // 4
      '      fill={', // 5
      '        on', // 6
      "          ? 'red'", // 7
      "          : 'var(--color-rop-text)'", // 8
      '      }', // 9
      '    />', // 10
      '  </svg>', // 11
      ');', // 12
    ].join('\n');
    expect(named(TSX, svg)).toEqual([['red', 7]]);
  });

  it.each([
    ['on one line', "const s = { boxShadow: '0 0 0 1px ' + 'red' };", [['red', 1]]],
    ['on several lines (Prettier)', "const s = {\n  boxShadow: '0 0 0 1px ' +\n    'red',\n};", [['red', 3]]],
  ])('point 2, a + concatenation %s', (_n, source, expected) => {
    expect(named(TSX, source)).toEqual(expected);
  });

  it('point 3, the comma operator: the last operand is the value', () => {
    expect(named(TSX, "const s = { color: (x(), 'red') };")).toEqual([['red', 1]]);
  });

  it('point 4, outline with a template with substitutions is judged whole', () => {
    expect(outline('const s = { outline: `${a} solid ${b} var(--color-rop-x)` };')).toEqual([]);
    expect(outline('const s = { outline: `2px solid ${c} var(--color-rop-focus)` };')).toEqual([]);
    expect(outline('const s = { outline: `2px solid ${c}` };')).toEqual([['2px solid ${c}', 1]]);
  });

  it.each([
    ['an arrow IIFE', "const s = { color: (() => 'red')() };", [['red', 1]]],
    ['a function IIFE', "const s = { color: (function(){ return 'red' })() };", [['red', 1]]],
    ['an IIFE behind a cast', "const s = { color: ((() => 'red') as () => string)() };", [['red', 1]]],
    ['an arrow IIFE in fill={...} in real JSX', "export const Dot = ({ on }: { on: boolean }) => (\n  <svg fill={((x) => (x ? 'red' : 'none'))(on)} />\n);", [['red', 2]]],
  ])('point 5, %s has its literals judged', (_n, source, expected) => {
    expect(named(TSX, source)).toEqual(expected);
  });

  it('point 5, a callee that is a name does not fire', () => {
    expect(rules(TSX, 'const s = { color: (red)(tone), background: (white as Pick)(), borderColor: black!() };')).toEqual([]);
  });
});
