// Publication guard for packages/pro. `.changeset/config.json` has `access: "public"`, so it is
// `"private": true` alone that stops changesets (and `npm publish`) from releasing the commercial
// package to the public registry. This test fails loudly if that guard is ever removed.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

describe('packages/pro publication guard', () => {
  const pkg = readJson('packages/pro/package.json');

  it('is the @react-object-page/pro package', () => {
    expect(pkg.name).toBe('@react-object-page/pro');
  });

  it('stays private (strictly true, not a truthy string)', () => {
    expect(pkg.private).toBe(true);
  });

  it('is not MIT licensed (commercial license, see packages/pro/LICENSE)', () => {
    expect(typeof pkg.license).toBe('string');
    expect(pkg.license.trim().toUpperCase()).not.toBe('MIT');
    expect(pkg.license).not.toMatch(/\bMIT\b/i);
  });

  it('the changesets config would publish publicly: private is the only guard', () => {
    // If this ever changes (e.g. restricted access, ignore list), revisit the guard above.
    expect(readJson('.changeset/config.json').access).toBe('public');
  });
});
