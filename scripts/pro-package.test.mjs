// Publication guard for packages/pro. `.changeset/config.json` has `access: "public"`, so it is
// `"private": true` alone that stops changesets (and `npm publish`) from releasing the commercial
// package to the public registry. This test fails loudly if that guard is ever removed.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

describe('packages/pro publication guard', () => {
  const pkg = readJson('packages/pro/package.json');

  it('homepage is the Pro demo on formrail.dev (ticket #667)', () => {
    expect(pkg.homepage).toBe('https://formrail.dev/pro/');
  });

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

  it('keeps "SEE LICENSE IN LICENSE" and no longer says the license is to be defined (ticket #691)', () => {
    expect(pkg.license).toBe('SEE LICENSE IN LICENSE');
    expect(pkg.description).not.toMatch(/to be defined/i);
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

/**
 * What the "React Hook Form" section of the Pro README must hold (#507): the parts of the text that are missing from
 * `readme` (the section runs from its heading to the next `## ` heading).
 */
export function missingReactHookFormDocs(readme) {
  const lines = readme.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === '## React Hook Form');
  if (start < 0) return ['## React Hook Form'];
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const section = lines.slice(start, end < 0 ? undefined : end).join('\n');
  const required = [
    'npm install @formrail/pro react-hook-form',
    "from '@formrail/pro/react-hook-form'",
    "from '@formrail/pro/engine'",
    '"private": true',
    'binding.reset(saved)',
    'isSaving',
    'saveError',
    'useChangeSummary().isEmpty',
    'formState.isDirty',
    'shouldUnregister',
    'rebase(incoming)',
  ];
  return required.filter((text) => !section.includes(text));
}

describe('packages/pro README: the React Hook Form section (#507)', () => {
  const readme = readFileSync(resolve(ROOT, 'packages/pro/README.md'), 'utf8');

  it('has the section, with install, import paths, saving, the isEmpty rule and the rebase', () => {
    expect(missingReactHookFormDocs(readme)).toEqual([]);
  });

  it('negative: a missing heading or a missing part is reported', () => {
    expect(missingReactHookFormDocs(readme.replace('## React Hook Form', '## RHF'))).toEqual(['## React Hook Form']);
    expect(missingReactHookFormDocs(readme.replace(/@formrail\/pro\/react-hook-form'/g, "x'"))).toEqual(["from '@formrail/pro/react-hook-form'"]);
    // Text outside the section does not count.
    expect(missingReactHookFormDocs("## React Hook Form\n\n## Next\nnpm install @formrail/pro react-hook-form")).toContain(
      'npm install @formrail/pro react-hook-form',
    );
  });
});

// Ticket #507: the React Hook Form adapter `@formrail/pro/react-hook-form`.
describe('packages/pro react-hook-form entry', () => {
  const pkg = readJson('packages/pro/package.json');
  const lock = readJson('package-lock.json');

  it('exports ./react-hook-form for import and require, each with its declaration file', () => {
    expect(pkg.exports['./react-hook-form']).toEqual({
      import: { types: './dist/react-hook-form.d.ts', default: './dist/react-hook-form.js' },
      require: { types: './dist/react-hook-form.d.cts', default: './dist/react-hook-form.cjs' },
    });
  });

  it('react-hook-form is an OPTIONAL peer and a devDependency, never a dependency', () => {
    expect(pkg.peerDependencies['react-hook-form']).toBeDefined();
    expect(pkg.peerDependenciesMeta['react-hook-form']).toEqual({ optional: true });
    expect(pkg.devDependencies['react-hook-form']).toBeDefined();
    expect(pkg.dependencies?.['react-hook-form']).toBeUndefined();
  });

  it('the peer range is the tested one: the devDependency range, whose floor is the version the lockfile installs', () => {
    const peer = pkg.peerDependencies['react-hook-form'];
    expect(peer).toBe(pkg.devDependencies['react-hook-form']);
    const floor = /^\^(\d+\.\d+\.\d+)$/.exec(peer)?.[1];
    expect(floor).toBeDefined();
    expect(lock.packages['node_modules/react-hook-form'].version).toBe(floor);
  });
});

/**
 * What the "TanStack Form" section of the Pro README must hold (#508): the parts of the text that are missing from
 * `readme` (the section runs from its heading to the next `## ` heading).
 */
export function missingTanStackFormDocs(readme) {
  const lines = readme.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === '## TanStack Form');
  if (start < 0) return ['## TanStack Form'];
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const section = lines.slice(start, end < 0 ? undefined : end).join('\n');
  const required = [
    // Install, without core, with the tested versions and the private org.
    'npm install @formrail/pro @tanstack/react-form',
    '`~1.33.5`',
    'a wider range follows a verified update',
    '`@formrail/core`\n  is not needed',
    '"private": true',
    // The usage.
    "from '@formrail/pro/tanstack-form'",
    "from '@formrail/pro/engine'",
    // The save mapping.
    'binding.reset(saved)',
    'form.state.isSubmitting',
    'isSaving',
    'saveError',
    // The dirty rule.
    'useChangeSummary().isEmpty',
    'state.isDirty',
    // Inline defaultValues and update() on a touched form.
    'inline',
    'TOUCHED form',
    // Server updates.
    'rebase(data)',
    'rebase(incoming)',
    // The recommended pattern (decision of 16/11 on #508): `defaultValues` kept on the binding's baseline.
    ...SAVED_PATTERN,
  ];
  return required.filter((text) => !section.includes(text));
}

/** The lines of the recommended pattern, the same in the README usage and in the copy-paste Example. */
const SAVED_PATTERN = ['const [saved, setSaved] = useState(', 'defaultValues: saved,', 'useEffect(() => setSaved(binding.baseline), [binding.baseline]);'];

describe('packages/pro README: the TanStack Form section (#508)', () => {
  const readme = readFileSync(resolve(ROOT, 'packages/pro/README.md'), 'utf8');

  it('has the section, with install, import paths, saving, the isEmpty rule, inline defaults, update() and the rebase', () => {
    expect(missingTanStackFormDocs(readme)).toEqual([]);
  });

  it('the usage and the copy-paste Example keep defaultValues on the baseline with the same lines', () => {
    const example = readFileSync(resolve(ROOT, 'packages/pro/src/integrations/tanstack-form/TanStackForm.example.tsx'), 'utf8');
    expect(SAVED_PATTERN.filter((line) => !example.includes(line))).toEqual([]);
    expect(missingTanStackFormDocs(readme.replace('useEffect(() => setSaved(binding.baseline)', 'useEffect(() => setSaved(incoming)'))).toEqual([
      SAVED_PATTERN[2],
    ]);
  });

  it('negative: a missing heading or a missing part is reported', () => {
    expect(missingTanStackFormDocs(readme.replace('## TanStack Form', '## TSF'))).toEqual(['## TanStack Form']);
    expect(missingTanStackFormDocs(readme.replace(/@formrail\/pro\/tanstack-form'/g, "x'"))).toEqual(["from '@formrail/pro/tanstack-form'"]);
    // Text outside the section does not count.
    expect(missingTanStackFormDocs('## TanStack Form\n\n## Next\nnpm install @formrail/pro @tanstack/react-form')).toContain(
      'npm install @formrail/pro @tanstack/react-form',
    );
  });
});

// Ticket #508: the TanStack Form adapter `@formrail/pro/tanstack-form`.
describe('packages/pro tanstack-form entry', () => {
  const pkg = readJson('packages/pro/package.json');
  const lock = readJson('package-lock.json');

  it('exports ./tanstack-form for import and require, each with its declaration file', () => {
    expect(pkg.exports['./tanstack-form']).toEqual({
      import: { types: './dist/tanstack-form.d.ts', default: './dist/tanstack-form.js' },
      require: { types: './dist/tanstack-form.d.cts', default: './dist/tanstack-form.cjs' },
    });
  });

  it('@tanstack/react-form is an OPTIONAL peer and a devDependency, never a dependency; form-core and store are none of them', () => {
    expect(pkg.peerDependencies['@tanstack/react-form']).toBeDefined();
    expect(pkg.peerDependenciesMeta['@tanstack/react-form']).toEqual({ optional: true });
    expect(pkg.devDependencies['@tanstack/react-form']).toBeDefined();
    expect(pkg.dependencies?.['@tanstack/react-form']).toBeUndefined();
    for (const name of ['@tanstack/form-core', '@tanstack/store']) {
      for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) expect(pkg[field]?.[name]).toBeUndefined();
    }
  });

  // Critic round 1 on PR #557: the adapter reads internals of TanStack Form that are not public API, so the peer accepts
  // the tested minor only (`~1.33.5`: >=1.33.5 <1.34.0). A newer minor gives a peer conflict, not a silent false dirty;
  // widening it is a ticket of its own, with the suite run on that version.
  it('the peer range is the tested minor only (~): the devDependency range, whose floor is the version the lockfile installs', () => {
    const peer = pkg.peerDependencies['@tanstack/react-form'];
    expect(peer).toBe(pkg.devDependencies['@tanstack/react-form']);
    const floor = /^~(\d+\.\d+\.\d+)$/.exec(peer)?.[1];
    expect(floor).toBeDefined();
    expect(lock.packages['node_modules/@tanstack/react-form'].version).toBe(floor);
  });
});

// Ticket #693: the Pro is published on GitHub Packages as @formrail-dev/pro (the workspace name does not change).
describe('packages/pro GitHub Packages configuration (#693)', () => {
  const pkg = readJson('packages/pro/package.json');

  it('publishConfig.registry is GitHub Packages', () => {
    expect(pkg.publishConfig?.registry).toBe('https://npm.pkg.github.com');
  });

  it('repository points to the public repository, directory packages/pro (GitHub links the package through it)', () => {
    expect(pkg.repository).toEqual({ type: 'git', url: 'git+https://github.com/Utumno1984/formrail.git', directory: 'packages/pro' });
  });

  it('the published name is @formrail-dev/pro while the workspace keeps @formrail/pro', async () => {
    const { PUBLISHED_NAME, buildPublishManifest } = await import('./release-pro.mjs');
    expect(PUBLISHED_NAME).toBe('@formrail-dev/pro');
    expect(buildPublishManifest(pkg).name).toBe('@formrail-dev/pro');
    expect(pkg.name).toBe('@formrail/pro');
  });

  it('the description is for the buyer: the license and where the package comes from, no internal notes', () => {
    expect(pkg.description).toBe('Pro tier of Formrail (commercial license, see LICENSE). Distributed through GitHub Packages as @formrail-dev/pro.');
    expect(pkg.description).not.toMatch(/private npm org|to be defined|workspace|scripts\//i);
  });

  // The Pro uses `@formrail/core/internal`, with no compatibility promise between core versions: each Pro release
  // asks for one exact core version, and the README makes the buyer install exactly that one (and the Pro exactly).
  it('the @formrail/core peer is an exact version, and the README Install pins the core to it and the Pro to its own version', () => {
    const peer = pkg.peerDependencies['@formrail/core'];
    expect(semver.valid(peer), `peer "${peer}" must be an exact version`).toBe(peer);
    const readme = readFileSync(resolve(ROOT, 'packages/pro/README.md'), 'utf8');
    const section = readme.slice(readme.indexOf('## Install (licensed teams)'), readme.indexOf('## Release (maintainers)'));
    const block = /```json\n([\s\S]*?)```/.exec(section)?.[1];
    expect(block).toBeDefined();
    const { dependencies } = JSON.parse(block);
    expect(dependencies).toEqual({ '@formrail/core': peer, '@formrail/pro': `npm:@formrail-dev/pro@${pkg.version}` });
    expect(section).toMatch(/exact/i);
    expect(section).toContain('@formrail/core/internal');
    expect(section).toContain('ERESOLVE');
    expect(readme).not.toMatch(/peer range must be revisited/i);
  });

  it('the README "Install (licensed teams)" has the .npmrc, NODE_AUTH_TOKEN, read:packages, the alias and a CI example, and no real token', () => {
    const readme = readFileSync(resolve(ROOT, 'packages/pro/README.md'), 'utf8');
    const section = readme.slice(readme.indexOf('## Install (licensed teams)'), readme.indexOf('## Release (maintainers)'));
    expect(section.length).toBeGreaterThan(0);
    for (const text of [
      '@formrail-dev:registry=https://npm.pkg.github.com',
      '${NODE_AUTH_TOKEN}',
      '`read:packages`',
      '"@formrail/pro": "npm:@formrail-dev/pro@',
      'secrets.',
      "import { computeChangeSummary } from '@formrail/pro/engine'",
    ]) {
      expect(section).toContain(text);
    }
    expect(readme).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}/);
    expect(readme).not.toMatch(/private npm org/i);
  });
});
