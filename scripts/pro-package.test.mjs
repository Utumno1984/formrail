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

  it('is the @formrail/pro package', () => {
    expect(pkg.name).toBe('@formrail/pro');
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

// Ticket #489: the engine entry `@formrail/pro/engine` and the form libraries it integrates with.
describe('packages/pro engine entry and form libraries', () => {
  const pkg = readJson('packages/pro/package.json');
  const FORM_LIBRARIES = ['react-hook-form', '@tanstack/react-form'];

  it('exports ./engine for import and require, each with its declaration file', () => {
    expect(pkg.exports['./engine']).toEqual({
      import: { types: './dist/engine.d.ts', default: './dist/engine.js' },
      require: { types: './dist/engine.d.cts', default: './dist/engine.cjs' },
    });
  });

  it.each(FORM_LIBRARIES)('%s is never a runtime dependency: devDependency, or an optional peer', (name) => {
    expect(pkg.dependencies?.[name]).toBeUndefined();
    if (pkg.peerDependencies?.[name] !== undefined) expect(pkg.peerDependenciesMeta?.[name]?.optional).toBe(true);
    expect(pkg.devDependencies?.[name] ?? pkg.peerDependencies?.[name]).toBeDefined();
  });

  it('@formrail/core is an OPTIONAL peer (decision 1a of Daniele, 14/11/2026): @formrail/pro/engine needs no core', () => {
    expect(pkg.peerDependencies['@formrail/core']).toBeDefined();
    expect(pkg.peerDependenciesMeta?.['@formrail/core']).toEqual({ optional: true });
    // react and react-dom stay required peers: every entry uses them.
    for (const name of ['react', 'react-dom']) {
      expect(pkg.peerDependencies[name]).toBeDefined();
      expect(pkg.peerDependenciesMeta?.[name]?.optional).not.toBe(true);
    }
  });

  it('has no runtime dependency at all (react, react-dom and the core are peers)', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
