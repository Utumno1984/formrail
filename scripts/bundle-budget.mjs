#!/usr/bin/env node
// Per-import bundle budget. For every public export of packages/core/dist we bundle a stub that
// imports only that export (esbuild, minified, tree-shaken) and measure its gzip size, then
// compare it with the versioned baseline in packages/core/bundle-budget.json.
// `check` NEVER writes the baseline; only `update-baseline` does, run locally and committed.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PACKAGE = resolve(ROOT, 'packages/core');
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
 * @returns {{ ok: boolean, errors: string[], lines: string[] }}
 */
export function compareBudget(measured, budget) {
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
        `${name}: public export without a budget. Add it explicitly with \`npm run bundle:update-baseline\` and commit packages/core/bundle-budget.json.`,
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
        `${name}: orphan budget entry, the export no longer exists in dist. Remove it with \`npm run bundle:update-baseline\`.`,
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
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({
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

export async function runCheck({
  packageDir = DEFAULT_PACKAGE,
  budgetPath = resolve(packageDir, 'bundle-budget.json'),
} = {}) {
  if (!existsSync(budgetPath)) {
    return {
      ok: false,
      errors: [`${budgetPath} not found. Run \`npm run bundle:update-baseline\` and commit it.`],
      lines: [],
    };
  }
  const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
  const measured = await measureAll(resolve(packageDir, 'dist/index.js'));
  return compareBudget(measured, budget);
}

export async function runUpdate({
  packageDir = DEFAULT_PACKAGE,
  budgetPath = resolve(packageDir, 'bundle-budget.json'),
} = {}) {
  const measured = await measureAll(resolve(packageDir, 'dist/index.js'));
  writeFileSync(budgetPath, `${JSON.stringify(buildBaseline(measured), null, 2)}\n`);
  return measured;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const opts = {};
  const pkgIdx = rest.indexOf('--package');
  if (pkgIdx >= 0) opts.packageDir = resolve(rest[pkgIdx + 1]);
  if (command === 'check') {
    const result = await runCheck(opts);
    for (const line of result.lines) console.log(`ok   ${line}`);
    for (const error of result.errors) console.error(`FAIL ${error}`);
    process.exit(result.ok ? 0 : 1);
  } else if (command === 'update-baseline') {
    const measured = await runUpdate(opts);
    for (const [name, size] of Object.entries(measured)) console.log(`${name}: ${size} B`);
    console.log('Baseline written. Review and commit packages/core/bundle-budget.json.');
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
