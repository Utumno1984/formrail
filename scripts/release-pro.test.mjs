// Ticket #693: the release script of the Pro package (GitHub Packages). Nothing here publishes anything and
// nothing reaches GitHub or the network: the published core versions are a fake list, the install uses the
// local tarball with an `file:` alias, and `npm publish` only ever runs with `--dry-run`.
// Needs `npm run build` (packages/pro/dist), like the dist tests of the package.
import { afterAll, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GITHUB_REGISTRY,
  PUBLISHED_NAME,
  PUBLISHED_SCOPE,
  assertCoreVersionsPublished,
  buildPublishManifest,
  checkPackFiles,
  checkSourcemap,
  pack,
  parseDryRunRegistry,
  release,
  stage,
} from './release-pro.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRO_DIR = join(ROOT, 'packages/pro');
const workspacePkg = JSON.parse(readFileSync(join(PRO_DIR, 'package.json'), 'utf8'));
const readme = readFileSync(join(PRO_DIR, 'README.md'), 'utf8');
const hasDist = existsSync(join(PRO_DIR, 'dist/engine.js'));
const FAKE_CORE_VERSIONS = ['0.1.0', '0.2.0'];

// Packing, `npm install` and `npm publish --dry-run` are real processes: generous timeout on a loaded machine (new tests).
vi.setConfig({ testTimeout: 60_000 });

const temps = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-pro-test-'));
  temps.push(dir);
  return dir;
};
afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('published name and manifest', () => {
  it('the scope is the formrail-dev org and the published name is @formrail-dev/pro', () => {
    expect(PUBLISHED_SCOPE).toBe('@formrail-dev');
    expect(PUBLISHED_NAME).toBe('@formrail-dev/pro');
    expect(GITHUB_REGISTRY).toBe('https://npm.pkg.github.com');
  });

  it('the published manifest has the published name, the GitHub registry, no private flag, scripts or devDependencies', () => {
    const manifest = buildPublishManifest(workspacePkg);
    expect(manifest.name).toBe('@formrail-dev/pro');
    expect(manifest.publishConfig).toEqual({ registry: 'https://npm.pkg.github.com' });
    expect(manifest.private).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.version).toBe(workspacePkg.version);
    expect(manifest.exports).toEqual(workspacePkg.exports);
    expect(manifest.peerDependencies).toEqual(workspacePkg.peerDependencies);
    expect(manifest.repository).toEqual(workspacePkg.repository);
  });

  it('does not mutate the workspace manifest', () => {
    const copy = structuredClone(workspacePkg);
    buildPublishManifest(copy);
    expect(copy).toEqual(workspacePkg);
  });
});

describe('assertCoreVersionsPublished', () => {
  const pkg = (peer, dev) => ({ peerDependencies: { '@formrail/core': peer }, devDependencies: { '@formrail/core': dev } });

  it('passes when the peer and dev ranges match a published version', () => {
    expect(() => assertCoreVersionsPublished(pkg('0.2.0', '^0.2.0'), FAKE_CORE_VERSIONS)).not.toThrow();
    expect(() => assertCoreVersionsPublished(workspacePkg, FAKE_CORE_VERSIONS)).not.toThrow();
  });

  it('fails when the peer range is not published yet', () => {
    expect(() => assertCoreVersionsPublished(pkg('0.3.0', '^0.2.0'), FAKE_CORE_VERSIONS)).toThrow(/peerDependencies.*0\.3\.0.*Publish @formrail\/core first/s);
  });

  it('fails when the dev range is not published yet', () => {
    expect(() => assertCoreVersionsPublished(pkg('0.2.0', '^0.3.0'), FAKE_CORE_VERSIONS)).toThrow(/devDependencies.*\^0\.3\.0/s);
  });

  it('fails on an empty list and on an invalid range', () => {
    expect(() => assertCoreVersionsPublished(pkg('0.2.0', '^0.2.0'), [])).toThrow(/published: none/);
    expect(() => assertCoreVersionsPublished(pkg('not a range', '^0.2.0'), FAKE_CORE_VERSIONS)).toThrow(/not a valid semver range/);
  });

  it('release() stops before packing when the core version is not published', () => {
    expect(() => release({ fetchCoreVersions: () => ['0.1.0'] })).toThrow(/Refusing to release/);
  });
});

describe('checkPackFiles / checkSourcemap', () => {
  const GOOD = ['LICENSE', 'README.md', 'package.json', 'dist/index.js', 'dist/index.js.map', 'dist/styles.css'];

  it('accepts dist/**, LICENSE, README.md and package.json', () => {
    expect(checkPackFiles(GOOD)).toEqual([]);
  });

  it.each(['src/index.ts', 'dist/a.test.js', 'dist/Button.stories.js', 'dist/src/x.js', 'bundle-budget.json', 'tsconfig.json'])('rejects %s', (path) => {
    expect(checkPackFiles([...GOOD, path])).toHaveLength(1);
  });

  it('reports a missing LICENSE, README, package.json or dist', () => {
    expect(checkPackFiles(['package.json', 'dist/a.js', 'README.md'])).toEqual(['missing from the tarball: LICENSE']);
    expect(checkPackFiles(['LICENSE', 'README.md', 'package.json'])).toEqual(['missing from the tarball: dist/**']);
  });

  it('accepts relative sources, rejects POSIX, Windows and file: absolute paths and sourceRoot', () => {
    expect(checkSourcemap('a.map', JSON.stringify({ sources: ['../src/a.ts'] }))).toEqual([]);
    expect(checkSourcemap('a.map', JSON.stringify({ sources: ['/home/me/x/src/a.ts'] }))).toHaveLength(1);
    expect(checkSourcemap('a.map', JSON.stringify({ sources: ['C:\\Users\\me\\a.ts'] }))).toHaveLength(1);
    expect(checkSourcemap('a.map', JSON.stringify({ sources: ['file:///home/me/a.ts'] }))).toHaveLength(1);
    expect(checkSourcemap('a.map', JSON.stringify({ sources: ['a.ts'], sourceRoot: '/home/me' }))).toHaveLength(1);
    expect(checkSourcemap('a.map', 'not json')).toHaveLength(1);
  });
});

describe('parseDryRunRegistry', () => {
  it('reads the registry npm says it would publish to', () => {
    expect(parseDryRunRegistry('npm notice Publishing to https://npm.pkg.github.com/ with tag latest and default access (dry-run)')).toBe(
      'https://npm.pkg.github.com',
    );
    expect(parseDryRunRegistry('npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access (dry-run)')).toBe(
      'https://registry.npmjs.org',
    );
    expect(parseDryRunRegistry('nothing')).toBeNull();
  });
});

describe.skipIf(!hasDist)('the tarball and the dry run (needs the build)', () => {
  it('the tarball holds dist/**, LICENSE, README.md and package.json only, with the published manifest', () => {
    const staged = stage();
    temps.push(staged);
    const out = tempDir();
    const { files, tarball } = pack(staged, out);
    expect(checkPackFiles(files)).toEqual([]);
    expect(files.some((f) => /\.test\.|\.stories\.|^src\//.test(f))).toBe(false);
    expect(files).toEqual(expect.arrayContaining(['LICENSE', 'README.md', 'package.json', 'dist/engine.js', 'dist/engine.cjs', 'dist/styles.css']));
    const manifest = JSON.parse(spawnSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' }).stdout);
    expect(manifest.name).toBe('@formrail-dev/pro');
    expect(manifest.private).toBeUndefined();
  });

  it('no sourcemap of the tarball names a path of the machine', () => {
    const staged = stage();
    temps.push(staged);
    const out = tempDir();
    const { tarball, files } = pack(staged, out);
    const maps = files.filter((f) => f.endsWith('.map'));
    expect(maps.length).toBeGreaterThan(0);
    for (const map of maps) {
      const text = spawnSync('tar', ['-xOzf', tarball, `package/${map}`], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout;
      expect(checkSourcemap(map, text)).toEqual([]);
      expect(text).not.toContain(ROOT);
    }
  });

  it('the dry run resolves the registry to GitHub Packages, not to registry.npmjs.org, and publishes nothing', () => {
    const report = release({ fetchCoreVersions: () => FAKE_CORE_VERSIONS });
    expect(report.name).toBe('@formrail-dev/pro');
    expect(report.registry).toBe('https://npm.pkg.github.com');
    expect(report.registry).not.toContain('npmjs.org');
    expect(report.published).toBe(false);
  });

  // npm 11 does not enforce `private` under `--dry-run` (verified: exit 0, no registry line), so a real `npm publish` is never run
  // here. What is pinned: `"private": true` stays in the source (npm refuses the real publish with EPRIVATE), and
  // even a stray publish attempt would never target the public npm registry (`publishConfig.registry`).
  it('the workspace stays "private": true, and its publishConfig sends a stray publish to GitHub, never to registry.npmjs.org', () => {
    expect(workspacePkg.private).toBe(true);
    expect(workspacePkg.publishConfig).toEqual({ registry: 'https://npm.pkg.github.com' });
  });

  it('the CLI is a dry run by default, and refuses --publish together with --dry-run', () => {
    const both = spawnSync('node', [join(ROOT, 'scripts/release-pro.mjs'), '--publish', '--dry-run'], { encoding: 'utf8' });
    expect(both.status).toBe(2);
    expect(both.stderr).toMatch(/mutually exclusive/);
  });
});

describe.skipIf(!hasDist)('installing the tarball through the alias, in a clean project', () => {
  // The registry of the buyer is replaced by the local tarball (`file:` alias): the registry split is checked on the
  // `.npmrc` of the README, the install and the imports on the tarball. No access to GitHub, no token.
  const npmrcFromReadme = () => {
    const section = readme.slice(readme.indexOf('## Install (licensed teams)'), readme.indexOf('## Release (maintainers)'));
    const block = /```ini\n([\s\S]*?)```/.exec(section)?.[1];
    expect(block).toBeDefined();
    return block;
  };

  it('the README .npmrc points only the @formrail-dev scope to GitHub, with the token from the environment', () => {
    const npmrc = npmrcFromReadme();
    expect(npmrc).toContain('@formrail-dev:registry=https://npm.pkg.github.com');
    expect(npmrc).toContain('//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}');
    expect(npmrc).not.toMatch(/^@formrail:registry/m);
    expect(npmrc).not.toMatch(/_authToken=(?!\$\{)/);

    // npm itself: the scope of the core stays on the default registry, the Pro scope goes to GitHub.
    const dir = tempDir();
    writeFileSync(join(dir, '.npmrc'), npmrc);
    const get = (key) =>
      spawnSync('npm', ['config', 'get', key, '--userconfig', join(dir, 'user.npmrc'), '--globalconfig', join(dir, 'global.npmrc')], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, NODE_AUTH_TOKEN: 'placeholder' },
      }).stdout.trim();
    expect(get('@formrail-dev:registry')).toBe('https://npm.pkg.github.com');
    expect(get('@formrail:registry')).toBe('undefined');
  });

  it('installs the tarball as @formrail/pro and @formrail/pro/engine works with ESM and CJS, without the core', () => {
    const staged = stage();
    temps.push(staged);
    const out = tempDir();
    const { tarball } = pack(staged, out);

    const project = tempDir();
    writeFileSync(
      join(project, 'package.json'),
      JSON.stringify({ name: 'buyer', private: true, type: 'module', dependencies: { '@formrail/pro': `file:${tarball}` } }),
    );
    const install = spawnSync('npm', ['install', '--offline', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: project,
      encoding: 'utf8',
    });
    expect(install.status, install.stderr).toBe(0);
    expect(existsSync(join(project, 'node_modules/@formrail/pro/dist/engine.js'))).toBe(true);
    // the engine needs react at runtime (peer): link the monorepo's copy, the core stays absent.
    for (const name of ['react', 'react-dom']) symlinkSync(join(ROOT, 'node_modules', name), join(project, 'node_modules', name));
    expect(existsSync(join(project, 'node_modules/@formrail/core'))).toBe(false);

    const script = "const m = ['computeChangeSummary'].map((k) => typeof X[k]).join(); console.log(m);";
    writeFileSync(join(project, 'esm.mjs'), `import * as X from '@formrail/pro/engine';\n${script}`);
    writeFileSync(join(project, 'cjs.cjs'), `const X = require('@formrail/pro/engine');\n${script}`);
    for (const file of ['esm.mjs', 'cjs.cjs']) {
      const run = spawnSync('node', [file], { cwd: project, encoding: 'utf8' });
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout.trim()).toBe('function');
    }
  });
});
