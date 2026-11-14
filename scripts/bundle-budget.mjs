#!/usr/bin/env node
// Per-import bundle budget. For every public export of each budgeted package (packages/core,
// packages/pro) we bundle a stub that imports only that export from <package>/dist (esbuild,
// minified, tree-shaken) and measure its gzip size, then compare it with the versioned baseline in
// <package>/bundle-budget.json.
// A package can also budget a subpath entry of its `exports` map (`@formrail/pro/engine`, ticket #489): measured
// from the file that subpath resolves to, against its own baseline file (`bundle-budget.engine.json`).
// `check` NEVER writes a baseline; only `update-baseline` does, run locally and committed.
// Without `--package <dir>`, `check` covers every budgeted package and fails if any one fails;
// `update-baseline` writes the baseline of `--package <dir>` (default: packages/core).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PACKAGE = resolve(ROOT, 'packages/core');
/** Packages whose public exports have a versioned budget; `check` covers all of them by default. */
export const BUDGETED_PACKAGES = ['packages/core', 'packages/pro'].map((dir) => resolve(ROOT, dir));
/** Subpath entries budgeted besides the main entry `.`, per package (absolute dir -> subpaths). */
export const BUDGETED_SUBPATHS = { [resolve(ROOT, 'packages/pro')]: ['./engine'] };

/** Baseline file of `subpath` (`.` -> bundle-budget.json, `./engine` -> bundle-budget.engine.json). */
export function budgetFileName(subpath) {
  if (subpath === '.') return 'bundle-budget.json';
  const name = subpath.replace(/^\.\//, '');
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`unsupported budgeted subpath ${JSON.stringify(subpath)}`);
  return `bundle-budget.${name}.json`;
}

/**
 * The ESM file a subpath of `packageDir` resolves to, read from the `exports` map of its package.json
 * (`import.default`, or a plain string): the file a consumer's bundler loads, not a guessed name.
 */
export function subpathFile(packageDir, subpath) {
  const pkgPath = resolve(packageDir, 'package.json');
  if (!existsSync(pkgPath)) throw new Error(`${displayPath(pkgPath)} not found: cannot resolve the subpath ${subpath}`);
  const target = JSON.parse(readFileSync(pkgPath, 'utf8')).exports?.[subpath];
  const file = typeof target === 'string' ? target : target?.import?.default ?? target?.import ?? target?.default;
  if (typeof file !== 'string' || !file.endsWith('.js')) {
    throw new Error(`${displayPath(pkgPath)}: the exports map has no ESM file for ${subpath}`);
  }
  return resolve(packageDir, file);
}

/** The budgeted entries of `packageDir`: the main entry `.` (dist/index.js) and its budgeted subpaths. */
export function budgetEntries(packageDir, subpaths = BUDGETED_SUBPATHS[resolve(packageDir)] ?? []) {
  return [
    { subpath: '.', distEntry: resolve(packageDir, 'dist/index.js'), budgetPath: resolve(packageDir, budgetFileName('.')) },
    ...subpaths.map((subpath) => ({
      subpath,
      distEntry: subpathFile(packageDir, subpath),
      budgetPath: resolve(packageDir, budgetFileName(subpath)),
    })),
  ];
}

/** Path shown in messages: relative to the repo root when inside it, absolute otherwise. */
export function displayPath(path) {
  const rel = relative(ROOT, path);
  return rel === '' || rel.startsWith('..') ? path : rel.split('\\').join('/');
}

/** Command that regenerates the baseline of `packageDir` (core is the default package). */
export function updateCommand(packageDir) {
  return resolve(packageDir) === DEFAULT_PACKAGE
    ? 'npm run bundle:update-baseline'
    : `npm run bundle:update-baseline -- --package ${displayPath(resolve(packageDir))}`;
}

const HEADROOM_RATIO = 1.1;
const HEADROOM_MIN_BYTES = 20;

/** limit written by update-baseline: 10% headroom, at least 20 bytes. */
export function limitFor(size) {
  return Math.max(Math.ceil(size * HEADROOM_RATIO), size + HEADROOM_MIN_BYTES);
}

const isInt = (n) => Number.isInteger(n) && n >= 0;

/** Validates the baseline file shape; returns a list of problems (empty when valid). */
export function validateBudget(budget) {
  if (!budget || typeof budget !== 'object' || Array.isArray(budget)) return ['baseline is not an object'];
  const problems = [];
  if (budget.version !== 1) problems.push(`unsupported baseline version ${JSON.stringify(budget.version)} (expected 1)`);
  const exp = budget.exports;
  if (!exp || typeof exp !== 'object' || Array.isArray(exp)) return [...problems, '`exports` is missing or not an object'];
  for (const name of Object.keys(exp)) {
    const e = exp[name];
    if (!e || typeof e !== 'object') problems.push(`${name}: entry is not an object`);
    else if (!isInt(e.baseline)) problems.push(`${name}: baseline must be a non-negative integer`);
    else if (!isInt(e.limit)) problems.push(`${name}: limit must be a non-negative integer`);
    else if (e.limit < e.baseline) problems.push(`${name}: limit (${e.limit}) is below baseline (${e.baseline})`);
  }
  return problems;
}

/**
 * Pure comparison.
 * @param {Record<string, number>} measured gzip bytes per public export
 * @param {{ exports: Record<string, { baseline: number, limit: number }> }} budget
 * @param {string} [budgetFile] baseline file named in the messages
 * @param {string} [update] command named in the messages to regenerate that baseline
 * @returns {{ ok: boolean, errors: string[], lines: string[] }}
 */
export function compareBudget(
  measured,
  budget,
  budgetFile = 'packages/core/bundle-budget.json',
  update = 'npm run bundle:update-baseline',
) {
  const problems = validateBudget(budget);
  if (problems.length > 0) {
    return { ok: false, errors: problems.map((p) => `invalid baseline: ${p}`), lines: [] };
  }
  const errors = [];
  const lines = [];
  const entries = budget.exports;
  for (const name of Object.keys(measured).sort()) {
    const entry = Object.hasOwn(entries, name) ? entries[name] : undefined;
    if (!entry) {
      errors.push(
        `${name}: public export without a budget. Add it explicitly with \`${update}\` and commit ${budgetFile}.`,
      );
      continue;
    }
    const size = measured[name];
    const delta = size - entry.baseline;
    const sign = delta > 0 ? '+' : '';
    const report = `${name}: measured ${size} B, baseline ${entry.baseline} B, delta ${sign}${delta} B, limit ${entry.limit} B`;
    if (size > entry.limit) errors.push(`${report} -> OVER LIMIT`);
    else lines.push(`${report}${delta < 0 ? ' (lighter than baseline, baseline not rewritten)' : ''}`);
  }
  for (const name of Object.keys(entries).sort()) {
    if (!Object.hasOwn(measured, name)) {
      errors.push(
        `${name}: orphan budget entry, the export no longer exists in dist. Remove it with \`${update}\`.`,
      );
    }
  }
  return { ok: errors.length === 0, errors, lines };
}

export function gzipBytes(code) {
  return gzipSync(code, { level: 9 }).length;
}

export async function listPublicExports(distEntry) {
  // Cache-busting query: the ESM loader caches by URL and dist may change within one process.
  const mod = await import(`${pathToFileURL(distEntry).href}?t=${Date.now()}-${Math.random()}`);
  return Object.keys(mod)
    .filter((k) => k !== 'default' && k !== '__esModule')
    .sort();
}

/**
 * dist/index.js keeps one `import ... from "react"` per original module. With a plain `external`,
 * esbuild retains every one of those imports even when its bindings are unused after tree-shaking,
 * so each new module adds a fixed ~40 B of measurement overhead to EVERY entry (e.g. composeRefs
 * grew with no code change). Marking the externals side-effect-free drops the unused imports and
 * keeps the ones the export really uses, so the measure reflects shipped code only. Real growth of
 * the export (or of anything it pulls in) is still counted in full.
 */
export const sideEffectFreeExternals = {
  name: 'side-effect-free-externals',
  setup(b) {
    // Every react / react-dom specifier (incl. subpaths such as react-dom/client) stays external.
    // So does `@formrail/core` (a peer dependency of pro): its code is not shipped by pro,
    // so it must not be charged to a pro export.
    b.onResolve({ filter: /^(react(-dom)?|@formrail\/core)(\/.*)?$/ }, (args) => ({
      path: args.path,
      external: true,
      sideEffects: false,
    }));
  },
};

export async function bundleExport(distEntry, name) {
  const result = await build({
    stdin: {
      contents: `import { ${name} } from ${JSON.stringify(distEntry)};\nglobalThis.__budget = ${name};`,
      resolveDir: dirname(distEntry),
      loader: 'js',
    },
    bundle: true,
    minify: true,
    treeShaking: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: [sideEffectFreeExternals],
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

export async function measureExport(distEntry, name) {
  return gzipBytes(await bundleExport(distEntry, name));
}

export async function measureAll(distEntry) {
  if (!existsSync(distEntry)) {
    throw new Error(`${distEntry} not found. Run \`npm run build\` first.`);
  }
  const measured = Object.create(null);
  for (const name of await listPublicExports(distEntry)) measured[name] = await measureExport(distEntry, name);
  return measured;
}

export function buildBaseline(measured) {
  const exports = {};
  for (const name of Object.keys(measured).sort()) {
    exports[name] = { baseline: measured[name], limit: limitFor(measured[name]) };
  }
  return {
    $comment:
      'Minified+gzip bytes per public import. Generated by `npm run bundle:update-baseline`; never written by CI.',
    version: 1,
    exports,
  };
}

async function checkEntry(packageDir, distEntry, budgetPath) {
  if (!existsSync(budgetPath)) {
    return {
      ok: false,
      errors: [`${displayPath(budgetPath)} not found. Run \`${updateCommand(packageDir)}\` and commit it.`],
      lines: [],
    };
  }
  const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
  const measured = await measureAll(distEntry);
  return compareBudget(measured, budget, displayPath(budgetPath), updateCommand(packageDir));
}

/**
 * Checks the main entry of `packageDir` against `budgetPath` and each budgeted subpath against its own baseline
 * file; the lines and errors of a subpath are prefixed with it (`./engine: computeRebase: measured ...`).
 */
export async function runCheck({
  packageDir = DEFAULT_PACKAGE,
  budgetPath = resolve(packageDir, 'bundle-budget.json'),
  subpaths,
} = {}) {
  const merged = { ok: true, errors: [], lines: [] };
  for (const entry of budgetEntries(packageDir, subpaths)) {
    const isMain = entry.subpath === '.';
    const result = await checkEntry(packageDir, entry.distEntry, isMain ? budgetPath : entry.budgetPath);
    const prefix = isMain ? '' : `${entry.subpath}: `;
    merged.ok = merged.ok && result.ok;
    merged.lines.push(...result.lines.map((line) => prefix + line));
    merged.errors.push(...result.errors.map((error) => prefix + error));
  }
  return merged;
}

/**
 * Checks several packages and merges the results: one package over its limit (or with an
 * unbudgeted export) fails the whole check even when the others are fine. Lines and errors are
 * prefixed with the package path.
 */
export async function runCheckAll({ packageDirs = BUDGETED_PACKAGES } = {}) {
  const merged = { ok: true, errors: [], lines: [] };
  for (const packageDir of packageDirs) {
    const prefix = `[${displayPath(packageDir)}] `;
    const result = await runCheck({ packageDir });
    merged.ok = merged.ok && result.ok;
    merged.lines.push(...result.lines.map((line) => prefix + line));
    merged.errors.push(...result.errors.map((error) => prefix + error));
  }
  return merged;
}

/**
 * Writes the baseline of the main entry (`budgetPath`) and of each budgeted subpath (its own file). Returns the
 * sizes of the main entry, plus those of each subpath under `<subpath>:<name>` keys.
 */
export async function runUpdate({
  packageDir = DEFAULT_PACKAGE,
  budgetPath = resolve(packageDir, 'bundle-budget.json'),
  subpaths,
} = {}) {
  const all = Object.create(null);
  for (const entry of budgetEntries(packageDir, subpaths)) {
    const isMain = entry.subpath === '.';
    const measured = await measureAll(entry.distEntry);
    writeFileSync(isMain ? budgetPath : entry.budgetPath, `${JSON.stringify(buildBaseline(measured), null, 2)}\n`);
    for (const [name, size] of Object.entries(measured)) all[isMain ? name : `${entry.subpath}:${name}`] = size;
  }
  return all;
}

/** Message printed after `update-baseline`: names the baseline file really written. */
export const updatedMessage = (budgetPath) => `Baseline written. Review and commit ${displayPath(budgetPath)}.`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const opts = {};
  const pkgIdx = rest.indexOf('--package');
  if (pkgIdx >= 0) {
    if (!rest[pkgIdx + 1]) throw new Error('--package needs a directory, e.g. --package packages/pro');
    opts.packageDir = resolve(rest[pkgIdx + 1]);
  }
  if (command === 'check') {
    const result = opts.packageDir ? await runCheck(opts) : await runCheckAll();
    for (const line of result.lines) console.log(`ok   ${line}`);
    for (const error of result.errors) console.error(`FAIL ${error}`);
    process.exit(result.ok ? 0 : 1);
  } else if (command === 'update-baseline') {
    const measured = await runUpdate(opts);
    for (const [name, size] of Object.entries(measured)) console.log(`${name}: ${size} B`);
    for (const entry of budgetEntries(opts.packageDir ?? DEFAULT_PACKAGE)) console.log(updatedMessage(entry.budgetPath));
  } else {
    console.error('Usage: bundle-budget.mjs <check|update-baseline> [--package <dir>]');
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(2);
  });
}
