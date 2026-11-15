#!/usr/bin/env node
// Ratchet guard on the legacy demo data (epic #512, ticket #515). The demo domain used to be supplier invoices
// ("Rossi Construction Ltd", "FT-2026-0001", `demo-invoices`, `demo-rows`, Acme, Northwind). The migration to
// several domains takes many tickets, and meanwhile new stories must not bring those strings back.
// Same model as bundle-budget.mjs: a versioned baseline (scripts/legacy-demo-data.baseline.json, file -> number
// of occurrences) that `check` only reads. `check` fails when a file outside the baseline has an occurrence or a
// count grows; it passes (and suggests `update`) when a count goes down. `update` rewrites the baseline but can
// only lower it: it never raises a count nor adds a file, except a rename (a new file is accepted only if the
// total does not grow).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = resolve(ROOT, 'scripts/legacy-demo-data.baseline.json');
export const GUIDE = 'CONTRIBUTING.md, section "Demo data"';

/** Where the legacy strings are looked for (repo-relative paths). */
const SCANNED = [
  /^packages\/[^/]+\/src\//,
  /^e2e\//,
  /^\.storybook\//,
  /^site-root\//,
  /^README\.md$/,
  /^packages\/[^/]+\/README\.md$/,
];
/** History, not demo: never scanned. */
const EXCLUDED = [/^\.changeset\//, /(^|\/)CHANGELOG\.md$/];
const TEXT_EXT = /\.(?:[cm]?[jt]sx?|mdx?|json|css|html|txt|ya?ml)$/i;

// The whole names of DEMO_SUPPLIERS (core demo-invoices.ts) and of the suppliers of demo-rows.ts (pro). Bare surnames are not searched.
const CORE_SUPPLIERS = [
  'Rossi Construction Ltd', 'Bianchi Supplies', 'Verdi Installations', 'Neri Transport', 'Gialli Office',
  'Esposito Services', 'Ferrari Mechanics', 'Romano Logistics', 'Colombo Computing', 'Ricci Furnishings',
  'Marino Energy', 'Greco Consulting',
];
const PRO_SUPPLIERS = [
  'Northwind Building Ltd', 'Bluebell Supplies', 'Greenfield Systems', 'Blackstone Freight', 'Yellowpage Office',
  'Harbor Services', 'Ironworks Mechanics', 'Riverside Logistics', 'Pinecone Computing', 'Oakline Furniture',
  'Seaside Energy', 'Summit Consulting',
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A word boundary that also holds for accented letters and digits: `Acmeda` is not `Acme`.
const NOT_BEFORE = '(?<![\\p{L}\\p{N}_])';
const NOT_AFTER = '(?![\\p{L}\\p{N}_])';
const word = (s) => `${NOT_BEFORE}${escape(s)}${NOT_AFTER}`;

/** Each term has a label and a regex source. Case-insensitive: `acme` counts as `ACME`. */
export const LEGACY_TERMS = [
  ...[...CORE_SUPPLIERS, ...PRO_SUPPLIERS, 'Acme', 'Northwind'].map((s) => ({ label: s, source: word(s) })),
  { label: 'FT-2026-', source: `${NOT_BEFORE}FT-2026-` },
  // The import of the modules (`from '../internal/demo-invoices'`, `import('./demo-rows')`): the specifier counts.
  { label: 'import of demo-invoices', source: `(?<=['"\`])[^'"\`\\n]*/demo-invoices(?:\\.[jt]sx?)?(?=['"\`])` },
  { label: 'import of demo-rows', source: `(?<=['"\`])[^'"\`\\n]*/demo-rows(?:\\.[jt]sx?)?(?=['"\`])` },
];

// One regex, longest alternative first, so `Rossi Construction Ltd` is one occurrence and not two (name + surname).
const ALTERNATION = [...LEGACY_TERMS]
  .sort((a, b) => b.label.length - a.label.length)
  .map((t) => `(?:${t.source})`)
  .join('|');

/** The legacy strings found in `text`, in order (comments count: they end up in "Show code"). */
export function findOccurrences(text) {
  return [...text.matchAll(new RegExp(ALTERNATION, 'giu'))].map((m) => m[0]);
}

/** Whether a repo-relative path is subject to the guard. */
export function isScanned(path) {
  const p = path.split('\\').join('/');
  return SCANNED.some((re) => re.test(p)) && !EXCLUDED.some((re) => re.test(p)) && TEXT_EXT.test(p);
}

/** Occurrences per file: `{ path: string[] }` for the files with at least one (`read` returns the text). */
export function measureFiles(paths, read) {
  const found = {};
  for (const path of paths.filter(isScanned)) {
    const text = read(path);
    if (text === null || text === undefined) continue;
    const hits = findOccurrences(text);
    if (hits.length > 0) found[path] = hits;
  }
  return found;
}

export const countsOf = (found) => Object.fromEntries(Object.keys(found).sort().map((f) => [f, found[f].length]));
const total = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const sample = (hits) => [...new Set(hits.map((h) => h.toLowerCase()))].slice(0, 3).map((h) => JSON.stringify(h)).join(', ');

export function validateBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) return ['baseline is not an object'];
  const problems = [];
  if (baseline.version !== 1) problems.push(`unsupported baseline version ${JSON.stringify(baseline.version)} (expected 1)`);
  const files = baseline.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return [...problems, '`files` is missing or not an object'];
  for (const [f, n] of Object.entries(files)) {
    if (!Number.isInteger(n) || n < 1) problems.push(`${f}: count must be a positive integer`);
  }
  return problems;
}

/**
 * Pure comparison of what is found with the baseline.
 * @param {Record<string, string[]>} found occurrences per file (see measureFiles)
 * @param {{ version: 1, files: Record<string, number> }} baseline
 * @returns {{ ok: boolean, errors: string[], notes: string[] }}
 */
export function compareLegacy(found, baseline, updateCommand = 'npm run legacy-demo:update') {
  const problems = validateBaseline(baseline);
  if (problems.length > 0) return { ok: false, errors: problems.map((p) => `invalid baseline: ${p}`), notes: [] };
  const errors = [];
  const notes = [];
  for (const file of Object.keys(found).sort()) {
    const n = found[file].length;
    const base = Object.hasOwn(baseline.files, file) ? baseline.files[file] : undefined;
    if (base === undefined) {
      errors.push(
        `${file}: ${n} legacy demo-data occurrence(s), e.g. ${sample(found[file])}. A file outside the baseline must not bring ` +
          `the supplier-invoice demo data back: use another domain (see ${GUIDE}). If this file is a rename of one ` +
          `in the baseline, run \`${updateCommand}\` (it accepts the transfer only when the total does not grow).`,
      );
    } else if (n > base) {
      errors.push(
        `${file}: ${n} legacy demo-data occurrences, baseline ${base}, e.g. ${sample(found[file])}. The count must not grow: ` +
          `use another domain (see ${GUIDE}).`,
      );
    } else if (n < base) {
      notes.push(`${file}: ${n} occurrence(s), baseline ${base}: lower it with \`${updateCommand}\` and commit the baseline.`);
    }
  }
  for (const file of Object.keys(baseline.files).sort()) {
    if (!Object.hasOwn(found, file)) {
      notes.push(`${file}: no longer has any (baseline ${baseline.files[file]}): drop the entry with \`${updateCommand}\`.`);
    }
  }
  return { ok: errors.length === 0, errors, notes };
}

/**
 * The baseline `update` would write, or the reasons it refuses. It can only go down: a count of an existing file
 * never grows, and a new file is accepted only as a rename, i.e. if the total does not grow.
 */
export function updateBaseline(found, baseline) {
  const problems = validateBaseline(baseline);
  if (problems.length > 0) return { ok: false, errors: problems.map((p) => `invalid baseline: ${p}`) };
  const next = countsOf(found);
  const errors = [];
  for (const [file, n] of Object.entries(next)) {
    if (Object.hasOwn(baseline.files, file) && n > baseline.files[file]) {
      errors.push(`${file}: ${n} > baseline ${baseline.files[file]}: the update never raises a count (see ${GUIDE}).`);
    }
  }
  if (total(next) > total(baseline.files)) {
    errors.push(
      `total ${total(next)} > baseline total ${total(baseline.files)}: the update never adds occurrences or files ` +
        `(only a rename, with a total that does not grow, is accepted; see ${GUIDE}).`,
    );
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, baseline: { version: 1, files: next } };
}

export function serialize(baseline) {
  return `${JSON.stringify({ version: 1, files: baseline.files }, null, 2)}\n`;
}

function listFiles() {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  return out.split('\0').filter(Boolean);
}
const readRepo = (path) => (existsSync(resolve(ROOT, path)) ? readFileSync(resolve(ROOT, path), 'utf8') : null);

function main() {
  const command = process.argv[2] ?? 'check';
  if (!['check', 'update'].includes(command)) {
    console.error('Usage: legacy-demo-data.mjs <check|update>');
    process.exit(2);
  }
  const found = measureFiles(listFiles(), readRepo);
  if (!existsSync(BASELINE_PATH)) {
    console.error('scripts/legacy-demo-data.baseline.json not found.');
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  if (command === 'check') {
    const { ok, errors, notes } = compareLegacy(found, baseline);
    for (const n of notes) console.log(n);
    if (!ok) {
      for (const e of errors) console.error(e);
      process.exit(1);
    }
    console.log(`legacy demo data: ${total(countsOf(found))} occurrence(s) in ${Object.keys(found).length} file(s), within the baseline.`);
    return;
  }
  const result = updateBaseline(found, baseline);
  if (!result.ok) {
    for (const e of result.errors) console.error(e);
    process.exit(1);
  }
  writeFileSync(BASELINE_PATH, serialize(result.baseline));
  console.log('Baseline written. Review and commit scripts/legacy-demo-data.baseline.json.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
