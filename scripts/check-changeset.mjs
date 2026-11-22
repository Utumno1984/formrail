#!/usr/bin/env node
// Changeset gate: every PR that touches a file under packages/* must add a changeset.
// Pure logic lives in `evaluateChangesetGate` (unit tested); the CLI computes the touched files
// with a merge-base diff (base..HEAD), never from the global repo state.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PACKAGE_RE = /^packages\/[^/]+\//;
const PACKAGE_JSON_RE = /^packages\/[^/]+\/package\.json$/;
const PACKAGE_CHANGELOG_RE = /^packages\/[^/]+\/CHANGELOG\.md$/;
const CHANGESET_RE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;

export const GUIDANCE = [
  'This PR touches files under packages/* but adds no changeset (.changeset/*.md).',
  'Run `npx changeset` and commit the generated file,',
  'or `npx changeset --empty` for a change that must not trigger a release.',
  'Only newly added changesets with a valid `---` frontmatter count (modifying an existing one does not).',
  'The rule is deliberately simple: any change under packages/* (including renames, deletions,',
  'and test-only changes) needs a changeset.',
].join('\n');

/**
 * @param {Array<string | { path: string, status?: string }>} changedFiles files touched by the
 *   PR (merge-base..HEAD). Strings count as added/modified; a status of "D" marks a deletion.
 * @param {(path: string) => string | null} [readContent] returns the content of an added changeset;
 *   when given, the changeset must have a valid `---...---` frontmatter (empty is fine for --empty).
 * @returns {{ ok: boolean, message: string, packageFiles: string[], changesets: string[] }}
 */
export function hasValidFrontmatter(content) {
  return typeof content === 'string' && /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.test(content);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];
const RANGE_PREFIX_RE = /^([\^~]?)(.+)$/;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function parseJson(text) {
  if (typeof text !== 'string') return null;
  try {
    const value = JSON.parse(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** Name and new version of a package whose package.json changed its `version` (null otherwise). */
export function bumpedPackage(baseText, headText) {
  const base = parseJson(baseText);
  const head = parseJson(headText);
  if (!base || !head || typeof head.name !== 'string' || typeof head.version !== 'string') return null;
  if (base.version === head.version) return null;
  return { name: head.name, version: head.version };
}

/**
 * True when the two package.json texts parse to JSON differing only in a changed `version` field and in
 * workspace-internal ranges (dependencies/devDependencies/peerDependencies entries naming a package of
 * `internalVersions`, a name -> new version map) that moved to the same prefix (`^`, `~` or none) plus
 * that package's new version. Entries added or removed, external packages and any other field disqualify.
 */
export function onlyVersionChanged(baseText, headText, internalVersions = {}) {
  const base = parseJson(baseText);
  const head = parseJson(headText);
  if (!base || !head) return false;
  if (!('version' in base) || !('version' in head)) return false;
  if (JSON.stringify(canonical(base.version)) === JSON.stringify(canonical(head.version))) return false;
  const restBase = { ...base };
  const restHead = { ...head };
  delete restBase.version;
  delete restHead.version;
  for (const field of DEP_FIELDS) {
    const b = restBase[field];
    const h = restHead[field];
    delete restBase[field];
    delete restHead[field];
    if (b === undefined && h === undefined) continue;
    if (!isObject(b) || !isObject(h)) return false;
    const names = Object.keys(b);
    if (names.length !== Object.keys(h).length) return false;
    for (const name of names) {
      if (!(name in h)) return false;
      if (b[name] === h[name]) continue;
      const target = Object.hasOwn(internalVersions, name) ? internalVersions[name] : undefined;
      if (typeof target !== 'string' || typeof b[name] !== 'string' || typeof h[name] !== 'string') return false;
      const prefix = RANGE_PREFIX_RE.exec(b[name])?.[1];
      if (prefix === undefined || h[name] !== `${prefix}${target}`) return false;
    }
  }
  return JSON.stringify(canonical(restBase)) === JSON.stringify(canonical(restHead));
}

export const EXEMPTION_MESSAGE = [
  'Changeset exemption applied (release PR): the diff is a version bump, not a change to be released.',
  '  - inside packages/* only the `version` field of package.json (plus workspace-internal dependency ranges aligned to the new versions) and CHANGELOG.md files changed;',
  '  - existing changesets (.changeset/*.md) were consumed (deleted);',
  '  - no changeset was added.',
].join('\n');

/** Exemption decided from the diff content only (never from branch name, author or labels). */
function isReleaseBump(entries, packageFiles, readContent, readBaseContent) {
  if (!readContent || !readBaseContent || packageFiles.length === 0) return false;
  const changesetEntries = entries.filter((e) => CHANGESET_RE.test(e.path));
  if (changesetEntries.some((e) => e.status === 'A')) return false;
  if (!changesetEntries.some((e) => e.status === 'D')) return false;
  // At least one package must actually be version-bumped: a CHANGELOG alone is not a release.
  if (!entries.some((e) => PACKAGE_JSON_RE.test(e.path))) return false;
  const internalVersions = {};
  for (const e of entries) {
    if (!PACKAGE_JSON_RE.test(e.path) || e.status !== 'M') continue;
    const bumped = bumpedPackage(readBaseContent(e.path), readContent(e.path));
    if (bumped) internalVersions[bumped.name] = bumped.version;
  }
  return entries
    .filter((e) => PACKAGE_RE.test(e.path))
    .every((e) => {
      if (PACKAGE_CHANGELOG_RE.test(e.path)) return e.status === 'A' || e.status === 'M';
      if (PACKAGE_JSON_RE.test(e.path)) {
        return e.status === 'M' && onlyVersionChanged(readBaseContent(e.path), readContent(e.path), internalVersions);
      }
      return false;
    });
}

/**
 * @param {(path: string) => string | null} [readBaseContent] returns a file's content at the merge-base;
 *   without it the release-PR exemption is never applied.
 */
export function evaluateChangesetGate(changedFiles, readContent, readBaseContent) {
  const entries = changedFiles.map((f) => (typeof f === 'string' ? { path: f, status: 'A' } : { status: 'A', ...f }));
  const packageFiles = entries.filter((e) => PACKAGE_RE.test(e.path)).map((e) => e.path);
  // Only ADDED changesets count: a modified one already existed on the base branch.
  const changesets = entries
    .filter((e) => CHANGESET_RE.test(e.path) && e.status === 'A')
    .filter((e) => !readContent || hasValidFrontmatter(readContent(e.path)))
    .map((e) => e.path);

  if (packageFiles.length === 0) {
    return { ok: true, message: 'No file under packages/* touched: no changeset required.', packageFiles, changesets };
  }
  if (isReleaseBump(entries, packageFiles, readContent, readBaseContent)) {
    return { ok: true, exempt: true, message: EXEMPTION_MESSAGE, packageFiles, changesets };
  }
  if (changesets.length === 0) {
    return {
      ok: false,
      message: `${GUIDANCE}\nTouched files under packages/*:\n${packageFiles.map((p) => `  - ${p}`).join('\n')}`,
      packageFiles,
      changesets,
    };
  }
  return { ok: true, message: `Changeset found: ${changesets.join(', ')}`, packageFiles, changesets };
}

/** Parses `git diff --name-status --no-renames -z` output (renames appear as delete + add). */
export function parseNameStatus(output) {
  const parts = output.split('\0').filter(Boolean);
  const entries = [];
  for (let i = 0; i + 1 < parts.length; i += 2) entries.push({ status: parts[i], path: parts[i + 1] });
  return entries;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

export function mergeBase(baseRef, headRef = 'HEAD') {
  return git(['merge-base', baseRef, headRef]).trim();
}

export function collectChangedFiles(baseRef, headRef = 'HEAD') {
  const base = mergeBase(baseRef, headRef);
  return parseNameStatus(git(['diff', '--name-status', '--no-renames', '-z', base, headRef]));
}

export function readAtRef(path, ref = 'HEAD') {
  try {
    return git(['show', `${ref}:${path}`]);
  } catch {
    return null;
  }
}

function main() {
  const baseRef = process.env.BASE_REF || 'origin/main';
  let files;
  let base;
  try {
    base = mergeBase(baseRef);
    files = collectChangedFiles(baseRef);
  } catch (error) {
    console.error(`Cannot compute the merge-base with ${baseRef} (is the checkout shallow? use fetch-depth: 0).`);
    console.error(String(error.message ?? error));
    process.exit(2);
  }
  const result = evaluateChangesetGate(files, (p) => readAtRef(p), (p) => readAtRef(p, base));
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
