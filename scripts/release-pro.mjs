#!/usr/bin/env node
// Release script for packages/pro (ticket #693): the Pro tier is distributed through GitHub Packages
// (decision of 2026-11-26, spec §2.4). In the monorepo the package stays `@formrail/pro` and `"private": true`
// (stories, examples and tests import `@formrail/pro`; a stray `npm publish` from the workspace fails). Only this
// script writes the PUBLISHED manifest into a staging directory: the name `@formrail-dev/pro`, no `private`,
// `publishConfig.registry` on GitHub Packages, and an `.npmrc` that maps the `@formrail-dev` scope to GitHub
// Packages with the token taken from `NODE_AUTH_TOKEN` (by reference: npm expands `${NODE_AUTH_TOKEN}` itself, the
// token is never written to disk). Buyers install the package with an npm alias, so their imports stay `@formrail/pro`.
//
//   node scripts/release-pro.mjs               dry run (default): stage, check the tarball, `npm publish --dry-run`
//   node scripts/release-pro.mjs --dry-run     same, explicit
//   node scripts/release-pro.mjs --publish     REAL publish to GitHub Packages (needs NODE_AUTH_TOKEN with
//                                              write:packages; only with the project owner's explicit go-ahead).
//                                              It runs the whole dry run first, registry check included, and
//                                              publishes only if that passes.
//
// Needs `npm run build` first: the script refuses a `dist` older than the sources of packages/pro (it does not build
// by itself: the build of the Pro needs the core built first, a chain `npm run build` owns, and a release script that
// rewrites `packages/pro/dist` would not be side-effect free in its default dry-run mode). It also verifies, before
// anything is published, that the `@formrail/core` versions the Pro asks for are already on the public npm registry.
import { spawn } from 'node:child_process';
import { constants as osConstants, tmpdir } from 'node:os';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRO_DIR = join(ROOT, 'packages/pro');

/** The npm scope of the GitHub organization that owns the package (on GitHub Packages scope === owner). */
export const PUBLISHED_SCOPE = '@formrail-dev';
/** The name the package is published under. The workspace keeps `@formrail/pro`. */
export const PUBLISHED_NAME = `${PUBLISHED_SCOPE}/pro`;
export const GITHUB_REGISTRY = 'https://npm.pkg.github.com';
export const NPM_REGISTRY = 'https://registry.npmjs.org';
export const CORE_NAME = '@formrail/core';
/** Prefix of every temporary directory the script creates (the tests look for leftovers by this prefix). */
export const TEMP_PREFIX = 'formrail-pro-';

/**
 * The `.npmrc` written into the staging directory. `${NODE_AUTH_TOKEN}` is literal: npm replaces it with the
 * environment variable when it reads the file, so the token never lands on disk. Same two lines as the README.
 */
export const STAGED_NPMRC = `${PUBLISHED_SCOPE}:registry=${GITHUB_REGISTRY}\n//${new URL(GITHUB_REGISTRY).host}/:_authToken=\${NODE_AUTH_TOKEN}\n`;

/** The manifest that goes into the tarball, derived from the workspace one. */
export function buildPublishManifest(pkg) {
  // Publish-time fields only: no scripts (nothing runs on pack/publish), no devDependencies (workspace tooling).
  const manifest = { ...pkg };
  for (const field of ['private', 'scripts', 'devDependencies', 'publishConfig', 'name']) delete manifest[field];
  return { name: PUBLISHED_NAME, ...manifest, publishConfig: { registry: GITHUB_REGISTRY } };
}

/** Throws unless every range of `@formrail/core` the Pro declares (peer and dev) matches a published version. */
export function assertCoreVersionsPublished(pkg, publishedVersions) {
  const problems = [];
  for (const field of ['peerDependencies', 'devDependencies', 'dependencies']) {
    const range = pkg[field]?.[CORE_NAME];
    if (range === undefined) continue;
    if (semver.validRange(range) === null) {
      problems.push(`${field}["${CORE_NAME}"] = "${range}" is not a valid semver range`);
    } else if (semver.maxSatisfying(publishedVersions, range) === null) {
      problems.push(`${field}["${CORE_NAME}"] = "${range}" matches no version published on npm (published: ${publishedVersions.join(', ') || 'none'})`);
    }
  }
  if (problems.length > 0) throw new Error(`Refusing to release: ${problems.join('; ')}. Publish ${CORE_NAME} first.`);
}

const FORBIDDEN_FILE = [/\.test\./, /\.stories\./, /(^|\/)src\//, /(^|\/)node_modules\//, /\.tsbuildinfo$/, /(^|\/)\.npmrc$/];
const ALLOWED_FILE = [/^dist\//, /^LICENSE$/, /^README\.md$/, /^package\.json$/];

/** Problems in the list of paths a tarball holds (empty list: fine). */
export function checkPackFiles(paths) {
  const problems = [];
  for (const path of paths) {
    if (FORBIDDEN_FILE.some((re) => re.test(path))) problems.push(`forbidden file in the tarball: ${path}`);
    else if (!ALLOWED_FILE.some((re) => re.test(path))) problems.push(`unexpected file in the tarball: ${path}`);
  }
  for (const required of ['LICENSE', 'README.md', 'package.json']) {
    if (!paths.includes(required)) problems.push(`missing from the tarball: ${required}`);
  }
  if (!paths.some((path) => path.startsWith('dist/'))) problems.push('missing from the tarball: dist/**');
  return problems;
}

// A sourcemap that names a path of the build machine leaks it: absolute POSIX (/home/...), Windows (C:\...) or file: URLs.
const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/]|file:)/;

/** Problems in one sourcemap's text: any `sources` entry (or `sourceRoot`) that is an absolute path. */
export function checkSourcemap(path, text) {
  let map;
  try {
    map = JSON.parse(text);
  } catch {
    return [`${path}: not valid JSON`];
  }
  const entries = [...(Array.isArray(map.sources) ? map.sources : []), ...(typeof map.sourceRoot === 'string' && map.sourceRoot ? [map.sourceRoot] : [])];
  return entries.filter((entry) => ABSOLUTE_PATH.test(entry)).map((entry) => `${path}: sourcemap with an absolute path (${entry})`);
}

/** The registry `npm publish` says it publishes to, from its output ("Publishing to <url> with tag"). */
export function parseDryRunRegistry(output) {
  return /Publishing to (\S+?)\/?\s+with tag/.exec(output)?.[1] ?? null;
}

/**
 * The arguments of `npm publish`. Both the registry and the scope registry go on the command line: a CLI flag
 * beats the environment (`npm_config_@formrail-dev:registry`) and every `.npmrc`, while `--registry` alone loses
 * to any `@formrail-dev:registry` set elsewhere. `--access` is not passed: GitHub Packages takes the visibility from
 * the package settings.
 */
export function publishArgs({ dryRun }) {
  return ['publish', '--registry', GITHUB_REGISTRY, `--${PUBLISHED_SCOPE}:registry=${GITHUB_REGISTRY}`, ...(dryRun ? ['--dry-run'] : [])];
}

/** Thrown for a wrong command line (exit code 2). */
export class UsageError extends Error {}

/** The command line, parsed (pure). Dry run unless `--publish`; unknown arguments are refused. */
export function parseArgs(argv) {
  let publish = false;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--publish') publish = true;
    else if (arg === '--dry-run') dryRun = true;
    else throw new UsageError(`Unknown argument: ${arg}. Usage: release-pro.mjs [--dry-run | --publish]`);
  }
  if (publish && dryRun) throw new UsageError('--publish and --dry-run are mutually exclusive.');
  return { publish };
}

// The temp directories and npm processes alive right now: the signal handlers of `runCli` clean them up.
const liveTemps = new Set();
const liveChildren = new Set();

const removeTemp = (dir) => {
  rmSync(dir, { recursive: true, force: true });
  liveTemps.delete(dir);
};

/**
 * Runs npm (the default `runNpm` of `release`): resolves to stdout and stdout + stderr together (npm prints its
 * notices on stderr); rejects on a non-zero exit or a signal. Releases and tests inject their own runner.
 */
export function npm(args, { cwd } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npm', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    liveChildren.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      liveChildren.delete(child);
      reject(error);
    });
    child.on('close', (status, signal) => {
      liveChildren.delete(child);
      if (status === 0) resolvePromise({ stdout, output: `${stdout}\n${stderr}` });
      else reject(new Error(`npm ${args.join(' ')} failed (${signal ?? status}):\n${stderr}`));
    });
  });
}

const listFiles = (dir, base = '') =>
  readdirSync(join(dir, base), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(dir, join(base, entry.name)) : [join(base, entry.name)],
  );

/** The build inputs of packages/pro: a change to any of them after the build leaves `dist` stale. */
const BUILD_INPUTS = ['src', 'tsup.config.ts', 'scripts/build-css.mjs', 'tsconfig.json'];

/**
 * Problems with `dist` (pure, on paths and modification times): missing, empty, or older than a build input.
 * `tsup` cleans `dist` and rewrites every file, so the oldest output must be newer than the newest input.
 */
export function checkDistFreshness(inputs, outputs) {
  if (outputs.length === 0) return ['packages/pro/dist is missing or empty: run `npm run build` first.'];
  const oldest = outputs.reduce((a, b) => (b.mtimeMs < a.mtimeMs ? b : a));
  const newer = inputs.filter((input) => input.mtimeMs > oldest.mtimeMs);
  if (newer.length === 0) return [];
  return [`packages/pro/dist is older than ${newer.map((input) => input.path).join(', ')}: run \`npm run build\` first.`];
}

const withMtimes = (dir, paths) => paths.map((path) => ({ path, mtimeMs: statSync(join(dir, path)).mtimeMs }));

/** `checkDistFreshness` on the files of `proDir`. */
export function distFreshnessProblems(proDir = PRO_DIR) {
  const dist = join(proDir, 'dist');
  const outputs = existsSync(dist) ? withMtimes(dist, listFiles(dist)) : [];
  const inputs = BUILD_INPUTS.filter((path) => existsSync(join(proDir, path))).flatMap((path) =>
    statSync(join(proDir, path)).isDirectory() ? withMtimes(proDir, listFiles(proDir, path)) : withMtimes(proDir, [path]),
  );
  return checkDistFreshness(inputs, outputs);
}

/**
 * Stages the publishable package in a fresh temp directory (under `os.tmpdir()`) and returns its path. On any
 * error the directory is removed before the error propagates.
 */
export function stage(proDir = PRO_DIR) {
  const stale = distFreshnessProblems(proDir);
  if (stale.length > 0) throw new Error(stale.join('\n'));
  let dir;
  let staged = false;
  try {
    dir = mkdtempSync(join(tmpdir(), `${TEMP_PREFIX}release-`));
    cpSync(join(proDir, 'dist'), join(dir, 'dist'), { recursive: true });
    for (const file of ['LICENSE', 'README.md']) cpSync(join(proDir, file), join(dir, file));
    const pkg = JSON.parse(readFileSync(join(proDir, 'package.json'), 'utf8'));
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify(buildPublishManifest(pkg), null, 2)}\n`);
    writeFileSync(join(dir, '.npmrc'), STAGED_NPMRC);
    staged = true;
    return dir;
  } finally {
    if (!staged && dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
}

/** Packs the staged directory into `destination`; returns the tarball path and the paths it holds. */
export async function pack(stagedDir, destination, runNpm = npm) {
  const [info] = JSON.parse((await runNpm(['pack', '--json', '--pack-destination', destination], { cwd: stagedDir })).stdout);
  return { tarball: join(destination, info.filename), files: info.files.map((f) => f.path) };
}

/** The paths the tarball of the staged directory would hold (`npm pack --dry-run`: nothing is written). */
export async function listPackFiles(stagedDir, runNpm = npm) {
  const [info] = JSON.parse((await runNpm(['pack', '--dry-run', '--json'], { cwd: stagedDir })).stdout);
  return info.files.map((f) => f.path);
}

export async function fetchCorePublishedVersions(runNpm = npm) {
  return JSON.parse((await runNpm(['view', CORE_NAME, 'versions', '--json', `--registry=${NPM_REGISTRY}`])).stdout);
}

/**
 * The whole release: returns a report; rejects on any problem. Always a dry run first (tarball check, then
 * `npm publish --dry-run` and the check of the registry it resolves to); with `publish: true`, and only if the dry
 * run passed, the real `npm publish`. `runNpm` and `fetchCoreVersions` are injectable (the tests never reach npm's
 * publish nor the network).
 */
export async function release({
  publish = false,
  proDir = PRO_DIR,
  runNpm = npm,
  fetchCoreVersions = () => fetchCorePublishedVersions(runNpm),
  env = process.env,
  log = () => {},
} = {}) {
  if (publish && !env.NODE_AUTH_TOKEN) {
    throw new Error('NODE_AUTH_TOKEN is not set: the real publish needs a GitHub token with write:packages in it.');
  }
  const workspacePkg = JSON.parse(readFileSync(join(proDir, 'package.json'), 'utf8'));
  assertCoreVersionsPublished(workspacePkg, await fetchCoreVersions());
  let staged;
  try {
    staged = stage(proDir);
    liveTemps.add(staged);
    const files = await listPackFiles(staged, runNpm);
    const problems = [
      ...checkPackFiles(files),
      ...listFiles(staged)
        .filter((path) => path.endsWith('.map'))
        .flatMap((map) => checkSourcemap(map, readFileSync(join(staged, map), 'utf8'))),
    ];
    if (problems.length > 0) throw new Error(`Tarball check failed:\n- ${problems.join('\n- ')}`);

    // The dry run runs in both modes, with the same arguments as the real publish but `--dry-run`.
    const dryRun = await runNpm(publishArgs({ dryRun: true }), { cwd: staged });
    const registry = parseDryRunRegistry(dryRun.output);
    if (registry !== new URL(GITHUB_REGISTRY).origin) {
      throw new Error(`The dry run resolves the registry to ${registry ?? 'unknown'}, expected ${GITHUB_REGISTRY}: nothing published.`);
    }
    log(`name: ${PUBLISHED_NAME}\nregistry: ${registry}\nfiles:\n${files.map((f) => `  ${f}`).join('\n')}`);

    if (publish) {
      const real = await runNpm(publishArgs({ dryRun: false }), { cwd: staged });
      // `npm_config_dry_run=true` in the environment turns the real publish into a dry run: say so, do not claim it.
      if (/\(dry-run\)/.test(real.output)) throw new Error('npm ran a dry run (npm_config_dry_run is set?): nothing published.');
    }
    return { name: PUBLISHED_NAME, registry, files, published: publish };
  } finally {
    if (staged !== undefined) removeTemp(staged);
  }
}

const SIGNALS = ['SIGINT', 'SIGTERM'];

/**
 * The CLI: parses `argv`, runs `release` and returns the exit code. While it runs, SIGINT / SIGTERM stop the npm
 * process in flight, remove the temp directories and exit with 128 + the signal number. `options` (tests only) go
 * to `release`, and `options.release` replaces it.
 */
export async function runCli(argv, { release: releaseFn = release, stdout = console.log, stderr = console.error, ...options } = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    stderr(error.message);
    return 2;
  }
  const onSignal = (signal) => {
    for (const child of liveChildren) child.kill(signal);
    for (const dir of [...liveTemps]) removeTemp(dir);
    stderr(`${signal}: stopped, temporary files removed.`);
    process.exit(128 + osConstants.signals[signal]);
  };
  for (const signal of SIGNALS) process.on(signal, onSignal);
  try {
    await releaseFn({ ...options, publish: parsed.publish, log: stdout });
    stdout(parsed.publish ? 'Published.' : 'Dry run OK (nothing published).');
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : error);
    return 1;
  } finally {
    for (const signal of SIGNALS) process.off(signal, onSignal);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await runCli(process.argv.slice(2)));
}
