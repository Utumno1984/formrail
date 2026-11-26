#!/usr/bin/env node
// Release script for packages/pro (ticket #693): the Pro tier is distributed through GitHub Packages
// (decision of 2026-11-26, spec §2.4). In the monorepo the package stays `@formrail/pro` and `"private": true`
// (stories, examples and tests import `@formrail/pro`; a stray `npm publish` from the workspace fails). Only this
// script writes the PUBLISHED manifest into a staging directory: the name `@formrail-dev/pro`, no `private`,
// `publishConfig.registry` on GitHub Packages. Buyers install it with an npm alias, so their imports stay
// `@formrail/pro`.
//
//   node scripts/release-pro.mjs               dry run (default): pack, verify, `npm publish --dry-run`
//   node scripts/release-pro.mjs --dry-run     same, explicit
//   node scripts/release-pro.mjs --publish     REAL publish to GitHub Packages (needs NODE_AUTH_TOKEN with
//                                              write:packages; only with Daniele's explicit go-ahead)
//
// Needs `npm run build` first. Verifies, before anything is published: the tarball content, and that the
// `@formrail/core` versions the Pro asks for are already on the public npm registry.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

const FORBIDDEN_FILE = [/\.test\./, /\.stories\./, /(^|\/)src\//, /(^|\/)node_modules\//, /\.tsbuildinfo$/];
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

/** The registry `npm publish --dry-run` says it would publish to, from its output ("Publishing to <url> with tag"). */
export function parseDryRunRegistry(output) {
  return /Publishing to (\S+?)\/?\s+with tag/.exec(output)?.[1] ?? null;
}

/** Runs npm and returns stdout and stderr together (npm prints its notices on stderr); throws on a non-zero exit. */
function npm(args, options = {}) {
  const result = spawnSync('npm', args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed (${result.status}):\n${result.stderr}`);
  return { stdout: result.stdout, output: `${result.stdout}\n${result.stderr}` };
}

/** Stages the publishable package in a fresh temp directory and returns its path. */
export function stage(proDir = PRO_DIR) {
  if (!existsSync(join(proDir, 'dist'))) throw new Error('packages/pro/dist is missing: run `npm run build` first.');
  const dir = mkdtempSync(join(tmpdir(), 'formrail-pro-release-'));
  cpSync(join(proDir, 'dist'), join(dir, 'dist'), { recursive: true });
  for (const file of ['LICENSE', 'README.md']) cpSync(join(proDir, file), join(dir, file));
  const pkg = JSON.parse(readFileSync(join(proDir, 'package.json'), 'utf8'));
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(buildPublishManifest(pkg), null, 2)}\n`);
  return dir;
}

/** Packs the staged directory; returns the tarball path and the paths it holds. */
export function pack(stagedDir, destination) {
  const [info] = JSON.parse(npm(['pack', '--json', '--pack-destination', destination], { cwd: stagedDir }).stdout);
  return { tarball: join(destination, info.filename), files: info.files.map((f) => f.path) };
}

const listMaps = (dir, base = '') =>
  readdirSync(join(dir, base), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listMaps(dir, join(base, entry.name)) : entry.name.endsWith('.map') ? [join(base, entry.name)] : [],
  );

export function fetchCorePublishedVersions() {
  return JSON.parse(npm(['view', CORE_NAME, 'versions', '--json', `--registry=${NPM_REGISTRY}`]).stdout);
}

/** The whole release: returns a report; throws on any problem. `publish: true` is the real thing. */
export function release({ publish = false, proDir = PRO_DIR, fetchCoreVersions = fetchCorePublishedVersions, log = () => {} } = {}) {
  const workspacePkg = JSON.parse(readFileSync(join(proDir, 'package.json'), 'utf8'));
  assertCoreVersionsPublished(workspacePkg, fetchCoreVersions());
  const staged = stage(proDir);
  const out = mkdtempSync(join(tmpdir(), 'formrail-pro-pack-'));
  try {
    const { files } = pack(staged, out);
    const problems = [
      ...checkPackFiles(files),
      ...listMaps(staged).flatMap((map) => checkSourcemap(map, readFileSync(join(staged, map), 'utf8'))),
    ];
    if (problems.length > 0) throw new Error(`Tarball check failed:\n- ${problems.join('\n- ')}`);
    // `--access` is not passed: GitHub Packages takes the visibility from the repository / package settings.
    const { output } = npm(['publish', '--registry', GITHUB_REGISTRY, ...(publish ? [] : ['--dry-run'])], { cwd: staged });
    const registry = parseDryRunRegistry(output);
    if (!publish && registry !== new URL(GITHUB_REGISTRY).origin) {
      throw new Error(`Dry run resolves the registry to ${registry ?? 'unknown'}, expected ${GITHUB_REGISTRY}`);
    }
    log(`name: ${PUBLISHED_NAME}\nregistry: ${registry ?? GITHUB_REGISTRY}\nfiles:\n${files.map((f) => `  ${f}`).join('\n')}`);
    return { name: PUBLISHED_NAME, registry, files, published: publish };
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(staged, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const publish = args.includes('--publish');
  if (publish && args.includes('--dry-run')) {
    console.error('--publish and --dry-run are mutually exclusive.');
    process.exit(2);
  }
  try {
    release({ publish, log: (text) => console.log(text) });
    console.log(publish ? 'Published.' : 'Dry run OK (nothing published).');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
