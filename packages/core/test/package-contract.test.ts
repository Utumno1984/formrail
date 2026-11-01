// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectDeclaredPaths, findMissingPaths } from './helpers/package-paths';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(packageDir, 'dist');
const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
  [key: string]: unknown;
};

describe('package.json contract (requires a prior `npm run build`)', () => {
  it('every path in main/module/types/exports exists in dist', () => {
    const declared = collectDeclaredPaths(pkg);
    expect(declared.length).toBeGreaterThan(0);
    expect(findMissingPaths(pkg, packageDir)).toEqual([]);
  });

  it('the CSS entries resolve through the exports map, like a consumer would', () => {
    const require = createRequire(import.meta.url);
    for (const entry of ['styles.css', 'theme.css']) {
      const resolved = require.resolve(`@react-object-page/core/${entry}`);
      expect(existsSync(resolved)).toBe(true);
      expect(resolved).toBe(join(distDir, entry));
    }
    // Subpaths that are not exported stay private.
    expect(() => require.resolve('@react-object-page/core/src/styles/tokens.css')).toThrow();
  });

  it('dist has an ESM entry, a CJS entry and type declarations', () => {
    const files = readdirSync(distDir);
    expect(files).toContain('index.js');
    expect(files).toContain('index.cjs');
    expect(files).toContain('index.d.ts');
    expect(files).toContain('index.d.cts');
  });

  it('the path resolver detects an exports entry pointing to a file the build did not generate', () => {
    const broken = {
      ...pkg,
      exports: { '.': { import: './dist/does-not-exist.js', require: './dist/index.cjs' } },
    };
    expect(findMissingPaths(broken, packageDir)).toEqual(['./dist/does-not-exist.js']);
  });

  it('the path resolver detects a missing main/module/types file', () => {
    expect(findMissingPaths({ main: './dist/nope.cjs' }, packageDir)).toEqual(['./dist/nope.cjs']);
    expect(findMissingPaths({ module: './dist/nope.js' }, packageDir)).toEqual(['./dist/nope.js']);
    expect(findMissingPaths({ types: './dist/nope.d.ts' }, packageDir)).toEqual([
      './dist/nope.d.ts',
    ]);
  });

  it('declares react and react-dom as peerDependencies with the right range, not dependencies', () => {
    const peers = pkg.peerDependencies as Record<string, string>;
    expect(peers.react).toBe('^18.0.0 || ^19.0.0');
    expect(peers['react-dom']).toBe('^18.0.0 || ^19.0.0');
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    expect(deps).not.toHaveProperty('react');
    expect(deps).not.toHaveProperty('react-dom');
  });

  it('declares sideEffects limited to CSS files (an imported stylesheet is never tree-shaken)', () => {
    expect(pkg.sideEffects).toEqual(['**/*.css']);
  });

  it('exposes styles.css and theme.css in exports and builds them into dist', () => {
    const exportsMap = pkg.exports as Record<string, unknown>;
    expect(exportsMap['./styles.css']).toBe('./dist/styles.css');
    expect(exportsMap['./theme.css']).toBe('./dist/theme.css');
    const files = readdirSync(distDir);
    expect(files).toContain('styles.css');
    expect(files).toContain('theme.css');
  });

  // NOTE: today `src` only imports React *types*, so this passes trivially. It becomes a real
  // guard as soon as a module imports React at runtime (tsup `external` must keep it out).
  it('does not bundle React sources into dist', () => {
    const bundled = readdirSync(distDir)
      .filter((f) => /\.(js|cjs)$/.test(f))
      .map((f) => readFileSync(join(distDir, f), 'utf8'))
      .join('\n');
    expect(bundled.length).toBeGreaterThan(0);
    expect(bundled).not.toMatch(
      /__SECRET_INTERNALS_DO_NOT_USE|react\.production|ReactCurrentOwner|react-dom\.production/,
    );
  });

  // `useObjectPageForm({ schema })` speaks Standard Schema through structural types only: no schema
  // library (nor `@standard-schema/spec`) may become a runtime or peer dependency, or reach dist.
  it('depends on no schema library: zod is a test-only devDependency and never reaches dist', () => {
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = (pkg[field] ?? {}) as Record<string, string>;
      expect(Object.keys(deps).filter((d) => /zod|valibot|arktype|standard-schema/.test(d))).toEqual([]);
    }
    const bundled = readdirSync(distDir)
      .filter((f) => /\.(js|cjs|d\.ts|d\.cts)$/.test(f))
      .map((f) => readFileSync(join(distDir, f), 'utf8'))
      .join('\n');
    expect(bundled).not.toMatch(/from ['"]zod|require\(['"]zod|@standard-schema\/spec/);
  });

  it('no non-test, non-story module under src imports zod', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name)) {
          if (/from ['"]zod(\/[^'"]*)?['"]|import\(['"]zod/.test(readFileSync(full, 'utf8'))) offenders.push(full);
        }
      }
    };
    walk(join(packageDir, 'src'));
    expect(offenders).toEqual([]);
  });
});
