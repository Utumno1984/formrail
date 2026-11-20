// #486: static guard on the styles of packages/pro. The Pro patterns must look like the same family as the
// core: colours, radii and the focus ring come from the core tokens, never from a literal typed in a component.
//
// Runs as a vitest file (`scripts/pro-style-guard.test.mjs`), so `npm run check` and the CI `unit-test` job
// (`npm run test:unit` -> `test:scripts`) run it; no extra job. Also runnable alone: `node scripts/pro-style-guard.mjs`.
//
// Strings are NOT ignored in TS (decision on #486): a colour literal inside a string or template is reported.
//
// Scope: `packages/pro/src/**/*.{css,ts,tsx}`, EXCEPT tests, stories, examples, test-kits, the story-only
// `showcase/` and `test/` folders (those are demos, not what the package ships). Comments are ignored.
//
// Rules (each violation is reported as `file:line`):
//   color-literal    `#hex`, `rgb(`/`rgba(`, `hsl(`/`hsla(`, `hwb(`, `lab(`, `lch(`, `oklab(`, `oklch(`
//   radius-literal   a `border-radius` (or `borderRadius`) that is not a `var(--radius-rop-*)`/`inherit`, and `rounded-[...]`
//   outline-color    an `outline` whose colour is not `var(--color-rop-*)`, `currentColor`, `transparent` or `inherit`
//   named-color     a CSS named colour (`red`, `black`) in a colour property, `fill`/`stroke`, a `bg-[red]`-style utility or color-mix()
//   spacing-literal  an arbitrary px/rem spacing utility off the Tailwind scale (`p-[13px]`); `p-4` is fine
//   unknown-token    a `var(--color-rop-x)` (or `--radius-rop-*`, `--text-rop-*`, ...) that `tokens.css` does not declare
//   allowlist        an allowlist entry without a reason, or one that no longer matches anything
//
// An exception lives in `scripts/pro-style-guard.allowlist.json`: one entry per exception, `{ file, rule, value, reason }`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRO_SRC = 'packages/pro/src';
const TOKENS = 'packages/core/src/styles/tokens.css';
const ALLOWLIST = 'scripts/pro-style-guard.allowlist.json';

const SKIP_FILE = /\.(test|stories|example|test-kit)\.[cm]?[jt]sx?$/;
const SKIP_DIR = new Set(['showcase', 'test', 'node_modules']);
const ACCEPTED_COLOR_WORDS = /^(currentcolor|transparent|inherit|initial|unset)$/i;
// Closed list of the CSS named colours (the keywords currentColor/transparent/inherit/initial/unset/none are not in it).
const NAMED_COLORS = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' ');
const NAMED_COLOR_RE = new RegExp(`(?<![\\w-])(?:${NAMED_COLORS.join('|')})(?![\\w-])`, 'gi');
const COLOR_PROPS = [
  'color', 'background', 'background-color', 'backgroundColor', 'box-shadow', 'boxShadow', 'text-decoration-color',
  'textDecorationColor', 'caret-color', 'caretColor', 'accent-color', 'accentColor', 'fill', 'stroke', 'column-rule-color',
  'columnRuleColor',
  'border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?|-(?:start|end)-(?:start|end))?(?:-color)?',
  'border(?:Top|Right|Bottom|Left|Block|Inline)?(?:Start|End)?(?:Color)?',
].join('|');
const TW_COLOR_UTILITY = '(?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|shadow|fill|stroke|from|via|to|decoration|accent|caret|divide|placeholder)';
const THEME_NAMESPACE = '(?:color|radius|text|font|z-index|motion|icon|container|animate)';

/** Replace comments with spaces (newlines kept, so line numbers hold). `ts`: also `//`; strings are respected. */
export function stripComments(source, kind) {
  let out = '';
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\' && kind === 'ts') out += source[++i] ?? '';
      else if (ch === quote || (ch === '\n' && quote !== '`')) quote = null;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
    } else if (kind === 'ts' && ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += ' '.repeat(stop - i);
      i = stop - 1;
    } else {
      if (ch === '"' || ch === "'" || (ch === '`' && kind === 'ts')) quote = ch;
      out += ch;
    }
  }
  return out;
}

/** Names declared by the core theme: `--color-rop-border: ...;` */
export function declaredTokens(tokensCss) {
  return new Set([...stripComments(tokensCss, 'css').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** The colour of an `outline` value is acceptable when it names a core token or a neutral keyword. */
function outlineColorOk(value) {
  if (/var\(\s*--color-rop-[\w-]+\s*\)/.test(value)) return true;
  const words = value.trim().split(/[\s_]+/);
  return words.some((w) => ACCEPTED_COLOR_WORDS.test(w)) || /^(none|0)$/.test(value.trim());
}

/**
 * Violations of one source: `[{ file, line, rule, value, message }]` (before the allowlist).
 * `tokens`: the Set from `declaredTokens` (omit to skip `unknown-token`).
 */
export function checkSource(file, source, tokens) {
  const kind = file.endsWith('.css') ? 'css' : 'ts';
  const text = stripComments(source, kind);
  const found = [];
  const add = (index, rule, value, message) => found.push({ file, line: lineOf(text, index), rule, value, message });

  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g)) {
    // In TS, an all-digit "#123" is an issue reference only when prose names it ("see ticket #470"); any other
    // all-digit hex ("#000000", "#111", "#12345678") is a colour. Prefer a comment for references (ignored).
    if (kind === 'ts' && /^#\d+$/.test(m[0]) && /\b(?:ticket|issue|PR|bug|see|fix(?:es)?|closes)\s+$/i.test(text.slice(0, m.index))) continue;
    add(m.index, 'color-literal', m[0].replace(/\($/, ''), `colour literal "${m[0]}": use a --color-rop-* token`);
  }

  for (const m of text.matchAll(/\bborder(?:-(?:top|bottom)-(?:left|right)|-(?:start|end)-(?:start|end))?-radius\s*:\s*([^;}\n"'`]*)|\bborderRadius\s*:\s*([^,;}\n]*)/g)) {
    const value = (m[1] ?? m[2]).trim();
    if (/^var\(\s*--radius-rop-[\w-]+\s*\)$/.test(value) || value === 'inherit') continue;
    add(m.index, 'radius-literal', value, `border-radius "${value}": use a rounded-rop-* class or var(--radius-rop-*)`);
  }
  for (const m of text.matchAll(/\brounded(?:-[a-z]{1,2})?-\[[^\]\s]*\]/g)) {
    add(m.index, 'radius-literal', m[0], `arbitrary radius "${m[0]}": use a rounded-rop-* class`);
  }

  // `outline: 2px solid red`, `outlineColor: "red"`, `outline: \`...\``: the value may sit inside quotes (TS style objects).
  for (const m of text.matchAll(/(?<![\w-])outline(?:-color|Color)?\s*:\s*["'`]?([^;}\n"'`\]]*)/g)) {
    const value = m[1].trim();
    if (!value) continue;
    if (!outlineColorOk(value)) add(m.index, 'outline-color', value, `outline "${value}": the colour must be var(--color-rop-*) or currentColor`);
  }

  // Named colours (`red`, `black`) only where a colour lives: colour properties, fill/stroke, Tailwind arbitrary colour
  // utilities and color-mix(). Anywhere else ("white-space", `text-red-500`, prose) is not a colour.
  const seen = new Set();
  const addNamed = (base, chunk) => {
    for (const n of chunk.matchAll(NAMED_COLOR_RE)) {
      const at = base + n.index;
      if (seen.has(at)) continue;
      seen.add(at);
      add(at, 'named-color', n[0].toLowerCase(), `named colour "${n[0]}": use a --color-rop-* token`);
    }
  };
  const propValue = kind === 'css' ? '([^;}\\]]*)' : `(?:"([^"\\n]*)"|'([^'\\n]*)'|\`([^\`]*)\`|([^;},"'\`\\]\\n]*))`;
  for (const m of text.matchAll(new RegExp(`(?<![\\w-])(?:${COLOR_PROPS})\\s*:\\s*${propValue}`, 'g'))) {
    const value = m.slice(1).find((g) => g !== undefined);
    if (value) addNamed(m.index + m[0].lastIndexOf(value), value);
  }
  for (const m of text.matchAll(/(?<![\w-])(?:fill|stroke)\s*=\s*\{?\s*["'`]([^"'`]*)["'`]/g)) {
    addNamed(m.index + m[0].indexOf(m[1]), m[1]);
  }
  for (const m of text.matchAll(new RegExp(`(?<![\\w])-?${TW_COLOR_UTILITY}-\\[([^\\]]*)\\]`, 'g'))) {
    // `_` is a space in a Tailwind arbitrary value; swap it for a space so word boundaries hold (same length)
    addNamed(m.index + m[0].indexOf('[') + 1, m[1].replace(/_/g, ' ').replace(/url\([^)]*\)/g, (u) => ' '.repeat(u.length)));
  }
  for (const m of text.matchAll(/color-mix\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) depth += text[i] === '(' ? 1 : text[i] === ')' ? -1 : 0;
    addNamed(start, text.slice(start, i));
  }

  for (const m of text.matchAll(/(?<![\w-])-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)-\[[^\]]*\d(?:px|rem)[^\]]*\]/g)) {
    add(m.index, 'spacing-literal', m[0], `arbitrary spacing "${m[0]}": use the Tailwind scale (p-4, gap-3, ...)`);
  }

  if (tokens) {
    for (const m of text.matchAll(new RegExp(`var\\(\\s*(--${THEME_NAMESPACE}-rop-[\\w-]+)`, 'g'))) {
      if (!tokens.has(m[1])) add(m.index, 'unknown-token', m[1], `${m[1]} is not declared by ${TOKENS}: token renamed or not a core token`);
    }
  }
  return found;
}

/** Apply the allowlist: returns `{ violations, problems }` (problems: bad or stale allowlist entries). */
export function applyAllowlist(violations, allowlist) {
  const problems = [];
  const used = new Set();
  const left = violations.filter((v) => {
    const idx = allowlist.findIndex((e) => e.file === v.file && e.rule === v.rule && e.value === v.value);
    if (idx === -1) return true;
    used.add(idx);
    return false;
  });
  allowlist.forEach((e, i) => {
    const label = `${ALLOWLIST}: entry ${i} (${e.file} ${e.rule} "${e.value}")`;
    if (typeof e.reason !== 'string' || e.reason.trim().length < 10) problems.push(`${label} has no reason (at least 10 characters)`);
    else if (!used.has(i)) problems.push(`${label} matches nothing any more: remove it`);
  });
  return { violations: left, problems };
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) yield* walk(full);
    } else if (/\.(css|ts|tsx)$/.test(entry.name) && !SKIP_FILE.test(entry.name) && !entry.name.endsWith('.d.ts')) yield full;
  }
}

/** The whole check on the repo; returns the messages (empty: all good). */
export function runGuard(root = ROOT) {
  const tokens = declaredTokens(readFileSync(join(root, TOKENS), 'utf8'));
  const allowlistPath = join(root, ALLOWLIST);
  const allowlist = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, 'utf8')) : [];
  let all = [];
  for (const abs of walk(join(root, PRO_SRC))) {
    const file = relative(root, abs).split('\\').join('/');
    all = all.concat(checkSource(file, readFileSync(abs, 'utf8'), tokens));
  }
  const { violations, problems } = applyAllowlist(all, allowlist);
  return [...violations.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`), ...problems];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messages = runGuard();
  if (messages.length) {
    console.error(`pro-style-guard: ${messages.length} problem(s)\n${messages.join('\n')}`);
    process.exit(1);
  }
  console.log('pro-style-guard: ok');
}
