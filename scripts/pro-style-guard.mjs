// #486: static guard on the styles of packages/pro. The Pro patterns must look like the same family as the
// core: colours, radii and the focus ring come from the core tokens, never from a literal typed in a component.
//
// Runs as a vitest file (`scripts/pro-style-guard.test.mjs`), so `npm run check` and the CI `unit-test` job
// (`npm run test:unit` -> `test:scripts`) run it; no extra job. Also runnable alone: `node scripts/pro-style-guard.mjs`.
//
// Scope: `packages/pro/src/**/*.{css,ts,tsx}`, EXCEPT tests, stories, examples, test-kits, the story-only
// `showcase/` and `test/` folders (those are demos, not what the package ships). Comments are ignored.
//
// Rules (each violation is reported as `file:line`):
//   color-literal    `#hex`, `rgb(`/`rgba(`, `hsl(`/`hsla(`, `hwb(`, `lab(`, `lch(`, `oklab(`, `oklch(`
//   radius-literal   a `border-radius` (or `borderRadius`) that is not a `var(--radius-rop-*)`/`inherit`, and `rounded-[...]`
//   outline-color    an `outline` whose colour is not `var(--color-rop-*)`, `currentColor`, `transparent` or `inherit`
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
    // "#123" (all digits) in TS is an issue reference in text, not a colour.
    if (kind === 'ts' && /^#\d+$/.test(m[0])) continue;
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

  for (const m of text.matchAll(/(?<![\w-])outline(?:-color)?\s*:\s*([^;}\n"'`\]]*)/g)) {
    const value = m[1].trim();
    if (!value) continue;
    if (!outlineColorOk(value)) add(m.index, 'outline-color', value, `outline "${value}": the colour must be var(--color-rop-*) or currentColor`);
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
