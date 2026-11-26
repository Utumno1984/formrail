// Ticket #693: the release script of the Pro package (GitHub Packages).
//
// Nothing here publishes, and no request leaves the machine:
// - `npm publish` is never spawned. `release()` always gets an injected npm runner that answers `publish` itself
//   (a canned "Publishing to <registry>" line); the runner that spawns the real npm refuses `publish` outright.
// - The real npm runs only `pack`, `install --offline` of a local tarball and `config get/list`, with `--offline`,
//   in an environment isolated for the whole file (below): empty user and global `.npmrc` in the scratch of the
//   test, no token, no inherited `npm_config_*`, `npm_config_dry_run=true` (lifted only for the two commands that
//   must write a file: `pack` into a destination and `install`), and a proxy on a closed local port.
// - The published core versions are a fake list; the CLI is tested through `parseArgs` and `runCli` with a stub
//   `release`, never as a process with `--publish`.
// - `TMPDIR` points to a dedicated directory: after every test no `formrail-pro-*` directory may be left there.
// The tests on the real `packages/pro/dist` need `npm run build`, like the dist tests of the package.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  GITHUB_REGISTRY,
  PUBLISHED_NAME,
  PUBLISHED_SCOPE,
  STAGED_NPMRC,
  TEMP_PREFIX,
  UsageError,
  assertCoreVersionsPublished,
  buildPublishManifest,
  checkDistFreshness,
  checkPackFiles,
  checkSourcemap,
  listPackFiles,
  pack,
  parseArgs,
  parseDryRunRegistry,
  publishArgs,
  release,
  runCli,
  stage,
} from './release-pro.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts/release-pro.mjs');
const PRO_DIR = join(ROOT, 'packages/pro');
const workspacePkg = JSON.parse(readFileSync(join(PRO_DIR, 'package.json'), 'utf8'));
const readme = readFileSync(join(PRO_DIR, 'README.md'), 'utf8');
const hasDist = existsSync(join(PRO_DIR, 'dist/engine.js'));
const FAKE_CORE_VERSIONS = ['0.1.0', '0.2.0'];
const NPMJS = 'https://registry.npmjs.org';

// Packing, `npm install` and `npm config` are real processes: generous timeout on a loaded machine (new tests).
vi.setConfig({ testTimeout: 60_000 });

// ---- Isolation of the whole file ------------------------------------------------------------------------------
const SCRATCH = mkdtempSync(join(tmpdir(), 'release-pro-test-'));
const TMP = join(SCRATCH, 'tmp');
mkdirSync(TMP);
for (const file of ['user.npmrc', 'global.npmrc']) writeFileSync(join(SCRATCH, file), '');
const savedEnv = { ...process.env };
for (const key of Object.keys(process.env)) {
  if (/^npm_config_/i.test(key) || /^(NODE_AUTH_TOKEN|NPM_TOKEN|GITHUB_TOKEN|GH_TOKEN|NO_PROXY|no_proxy|HTTPS?_PROXY|https?_proxy)$/.test(key)) {
    delete process.env[key];
  }
}
Object.assign(process.env, {
  TMPDIR: TMP,
  npm_config_userconfig: join(SCRATCH, 'user.npmrc'),
  npm_config_globalconfig: join(SCRATCH, 'global.npmrc'),
  npm_config_cache: join(SCRATCH, 'npm-cache'),
  npm_config_dry_run: 'true',
  npm_config_offline: 'true',
  npm_config_proxy: 'http://127.0.0.1:9',
  npm_config_https_proxy: 'http://127.0.0.1:9',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_update_notifier: 'false',
});
afterAll(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  rmSync(SCRATCH, { recursive: true, force: true });
});

const leftovers = (dir = TMP) => readdirSync(dir).filter((name) => name.startsWith(TEMP_PREFIX));
afterEach(() => {
  expect(leftovers(), 'temporary directories left by the release script').toEqual([]);
});

let counter = 0;
const scratchDir = (name = 'dir') => {
  const dir = join(SCRATCH, `${name}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** The real npm, isolated (see above). `writes`: lifts `npm_config_dry_run` for a command that must write a file. */
const realNpm =
  ({ writes = false, env = {} } = {}) =>
  (args, { cwd } = {}) => {
    if (args[0] === 'publish') throw new Error('test bug: the tests never spawn npm publish');
    const result = spawnSync('npm', [...args, '--offline'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...(writes ? { npm_config_dry_run: 'false' } : {}), ...env },
    });
    if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed (${result.status}):\n${result.stderr}`);
    return { stdout: result.stdout, output: `${result.stdout}\n${result.stderr}` };
  };

const publishLine = (registry, dryRun) => `npm notice Publishing to ${registry}/ with tag latest and default access${dryRun ? ' (dry-run)' : ''}`;

/**
 * The npm runner given to `release()`: `pack` goes to the real (isolated) npm unless replaced, `publish` is
 * answered here and recorded. `registry` is where the canned output says npm would publish (`null`: no such line).
 */
const recordingNpm = ({ registry = GITHUB_REGISTRY, packRunner = realNpm(), realPublishOutput } = {}) => {
  const calls = [];
  const run = async (args, options) => {
    calls.push(args);
    if (args[0] === 'pack') return packRunner(args, options);
    if (args[0] === 'publish') {
      const dryRun = args.includes('--dry-run');
      const line = registry === null ? 'npm notice nothing to see' : publishLine(registry, dryRun);
      return { stdout: '', output: !dryRun && realPublishOutput !== undefined ? realPublishOutput : line };
    }
    throw new Error(`unexpected npm ${args.join(' ')}`);
  };
  const publishes = () => calls.filter((args) => args[0] === 'publish');
  return { run, calls, publishes, realPublishes: () => publishes().filter((args) => !args.includes('--dry-run')) };
};

/** A minimal packages/pro: the workspace manifest, LICENSE, README, one source and a dist newer than it. */
const makeProFixture = ({ license = true, distAge = 50, srcAge = 100 } = {}) => {
  const dir = scratchDir('pro-fixture');
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify(workspacePkg, null, 2));
  if (license) writeFileSync(join(dir, 'LICENSE'), 'Commercial license (fixture).\n');
  writeFileSync(join(dir, 'README.md'), '# fixture\n');
  writeFileSync(join(dir, 'src/index.ts'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'dist/index.js'), 'export const a = 1;\n//# sourceMappingURL=index.js.map\n');
  writeFileSync(join(dir, 'dist/index.js.map'), JSON.stringify({ version: 3, sources: ['../src/index.ts'], mappings: '' }));
  const now = Date.now() / 1000;
  utimesSync(join(dir, 'src/index.ts'), now - srcAge, now - srcAge);
  for (const file of ['index.js', 'index.js.map']) utimesSync(join(dir, 'dist', file), now - distAge, now - distAge);
  return dir;
};

const releaseOptions = (npmRunner, extra = {}) => ({ proDir: makeProFixture(), runNpm: npmRunner.run, fetchCoreVersions: () => FAKE_CORE_VERSIONS, ...extra });
const TOKEN_ENV = { NODE_AUTH_TOKEN: 'placeholder-not-a-token' };

// The `ini` blocks of a Markdown text, without the indentation of the list item they sit in.
const iniBlocks = (text) =>
  [...text.matchAll(/^( *)```ini\n([\s\S]*?)^ *```/gm)].map(([, indent, body]) =>
    body
      .split('\n')
      .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
      .join('\n'),
  );
const section = (start, end) => readme.slice(readme.indexOf(start), readme.indexOf(end));

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

  it('release() stops before staging or running npm when the core version is not published', async () => {
    const npm = recordingNpm();
    await expect(release(releaseOptions(npm, { fetchCoreVersions: () => ['0.1.0'] }))).rejects.toThrow(/Refusing to release/);
    expect(npm.calls).toEqual([]);
  });
});

describe('checkPackFiles / checkSourcemap', () => {
  const GOOD = ['LICENSE', 'README.md', 'package.json', 'dist/index.js', 'dist/index.js.map', 'dist/styles.css'];

  it('accepts dist/**, LICENSE, README.md and package.json', () => {
    expect(checkPackFiles(GOOD)).toEqual([]);
  });

  it.each(['src/index.ts', 'dist/a.test.js', 'dist/Button.stories.js', 'dist/src/x.js', 'bundle-budget.json', 'tsconfig.json', '.npmrc'])('rejects %s', (path) => {
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
    expect(parseDryRunRegistry(publishLine('https://npm.pkg.github.com', true))).toBe('https://npm.pkg.github.com');
    expect(parseDryRunRegistry(publishLine(NPMJS, true))).toBe(NPMJS);
    expect(parseDryRunRegistry('nothing')).toBeNull();
  });
});

describe('command line (parseArgs, runCli with a stub release)', () => {
  it('is a dry run by default and with --dry-run; --publish asks for the real publish', () => {
    expect(parseArgs([])).toEqual({ publish: false });
    expect(parseArgs(['--dry-run'])).toEqual({ publish: false });
    expect(parseArgs(['--publish'])).toEqual({ publish: true });
  });

  it('refuses --publish together with --dry-run, and any unknown argument', () => {
    expect(() => parseArgs(['--publish', '--dry-run'])).toThrow(UsageError);
    expect(() => parseArgs(['--dry-run', '--publish'])).toThrow(/mutually exclusive/);
    for (const argv of [['--publsh'], ['--publish=false'], ['publish'], ['--dry-run', '-p']]) {
      expect(() => parseArgs(argv), argv.join(' ')).toThrow(/Unknown argument/);
    }
  });

  const stubRelease = () => vi.fn(async () => ({ published: false }));
  const quiet = () => ({ stdout: vi.fn(), stderr: vi.fn() });

  it('runCli with no argument calls release with publish: false and reports a dry run', async () => {
    const releaseFn = stubRelease();
    const io = quiet();
    expect(await runCli([], { release: releaseFn, ...io })).toBe(0);
    expect(releaseFn).toHaveBeenCalledTimes(1);
    expect(releaseFn.mock.calls[0][0].publish).toBe(false);
    expect(io.stdout).toHaveBeenLastCalledWith('Dry run OK (nothing published).');
  });

  it('runCli --publish calls release with publish: true; an option cannot turn a dry run into a publish', async () => {
    const releaseFn = stubRelease();
    expect(await runCli(['--publish'], { release: releaseFn, ...quiet() })).toBe(0);
    expect(releaseFn.mock.calls[0][0].publish).toBe(true);
    const dry = stubRelease();
    expect(await runCli([], { release: dry, publish: true, ...quiet() })).toBe(0);
    expect(dry.mock.calls[0][0].publish).toBe(false);
  });

  it('runCli exits 2 on a wrong command line without calling release, 1 when release fails', async () => {
    const releaseFn = stubRelease();
    const io = quiet();
    expect(await runCli(['--publish', '--dry-run'], { release: releaseFn, ...io })).toBe(2);
    expect(await runCli(['--nope'], { release: releaseFn, ...io })).toBe(2);
    expect(releaseFn).not.toHaveBeenCalled();
    expect(io.stderr).toHaveBeenCalledWith('--publish and --dry-run are mutually exclusive.');
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await runCli([], { release: failing, ...io })).toBe(1);
    expect(io.stderr).toHaveBeenLastCalledWith('boom');
  });

  it('runCli leaves no signal handler behind', async () => {
    const before = ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal));
    await runCli([], { release: stubRelease(), ...quiet() });
    await runCli(['--x'], { release: stubRelease(), ...quiet() });
    expect(['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal))).toEqual(before);
  });
});

describe('npm publish arguments', () => {
  it('the dry run and the real publish name the registry and the scope registry on the command line; only the dry run has --dry-run', () => {
    const flags = ['--registry', 'https://npm.pkg.github.com', '--@formrail-dev:registry=https://npm.pkg.github.com'];
    expect(publishArgs({ dryRun: true })).toEqual(['publish', ...flags, '--dry-run']);
    expect(publishArgs({ dryRun: false })).toEqual(['publish', ...flags]);
  });
});

describe('stage(): the staging directory and its .npmrc', () => {
  it('writes the published manifest and an .npmrc with the scope on GitHub and the token by reference, never its value', async () => {
    vi.stubEnv('NODE_AUTH_TOKEN', 'placeholder-value-from-the-environment');
    let staged;
    try {
      staged = stage(makeProFixture());
      expect(dirname(staged)).toBe(TMP);
      const npmrc = readFileSync(join(staged, '.npmrc'), 'utf8');
      expect(npmrc).toBe('@formrail-dev:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n');
      expect(npmrc).not.toContain('placeholder-value-from-the-environment');
      expect(JSON.parse(readFileSync(join(staged, 'package.json'), 'utf8')).name).toBe('@formrail-dev/pro');
      // The .npmrc never goes into the tarball (npm leaves it out; checkPackFiles would refuse it).
      const files = await listPackFiles(staged, realNpm());
      expect(files).not.toContain('.npmrc');
      expect(checkPackFiles(files)).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      if (staged) rmSync(staged, { recursive: true, force: true });
    }
  });

  it('npm in the staging directory reads that .npmrc, and the publish flags beat an environment override of the scope registry', () => {
    const staged = stage(makeProFixture());
    try {
      const flags = publishArgs({ dryRun: true }).slice(1);
      const get = (extraArgs, env) => realNpm({ env })(['config', 'get', '@formrail-dev:registry', ...extraArgs], { cwd: staged }).stdout.trim();
      expect(get([], {})).toBe('https://npm.pkg.github.com');
      const override = { 'npm_config_@formrail-dev:registry': NPMJS };
      // The scenario is real: an environment variable moves the scope off GitHub when only the .npmrc says otherwise...
      expect(get([], override)).toBe(NPMJS);
      // ...and the flags the script passes to `npm publish` win over it.
      expect(get(flags, override)).toBe('https://npm.pkg.github.com');
      // The token line is read from the project config (npm shows it as protected, never its value).
      const list = realNpm()(['config', 'list'], { cwd: staged }).stdout;
      expect(list).toContain(`"project" config from ${join(staged, '.npmrc')}`);
      expect(list).toMatch(/\/\/npm\.pkg\.github\.com\/:_authToken = \(protected\)/);
    } finally {
      rmSync(staged, { recursive: true, force: true });
    }
  });

  it('the .npmrc is the same as the README ones (Install and Release)', () => {
    const blocks = iniBlocks(readme);
    expect(blocks).toHaveLength(2);
    for (const block of blocks) expect(block).toBe(STAGED_NPMRC);
  });

  it('an error while staging removes the directory (missing LICENSE)', () => {
    expect(() => stage(makeProFixture({ license: false }))).toThrow(/LICENSE/);
    expect(leftovers()).toEqual([]);
  });

  it('refuses a dist older than the sources, before creating anything', () => {
    expect(() => stage(makeProFixture({ srcAge: 10, distAge: 50 }))).toThrow(/dist is older than src\/index\.ts.*npm run build/);
    expect(leftovers()).toEqual([]);
    const noDist = makeProFixture();
    rmSync(join(noDist, 'dist'), { recursive: true });
    expect(() => stage(noDist)).toThrow(/dist is missing or empty/);
  });

  it('checkDistFreshness: missing dist, a source newer than the oldest output, an up-to-date build', () => {
    expect(checkDistFreshness([{ path: 'src/a.ts', mtimeMs: 1 }], [])).toHaveLength(1);
    const outputs = [
      { path: 'index.js', mtimeMs: 20 },
      { path: 'styles.css', mtimeMs: 30 },
    ];
    expect(checkDistFreshness([{ path: 'src/a.ts', mtimeMs: 10 }], outputs)).toEqual([]);
    expect(checkDistFreshness([{ path: 'src/a.ts', mtimeMs: 25 }], outputs)).toEqual([
      'packages/pro/dist is older than src/a.ts: run `npm run build` first.',
    ]);
  });
});

describe('release(): dry run first, publish only after the registry check', () => {
  it('by default it is a dry run: npm publish only ever runs with --dry-run, and nothing is published', async () => {
    const npm = recordingNpm();
    const report = await release(releaseOptions(npm));
    expect(npm.publishes()).toEqual([publishArgs({ dryRun: true })]);
    expect(npm.realPublishes()).toEqual([]);
    expect(report).toMatchObject({ name: '@formrail-dev/pro', registry: 'https://npm.pkg.github.com', published: false });
  });

  it('with publish: true it runs the dry run first, then the real publish, once', async () => {
    const npm = recordingNpm();
    const report = await release(releaseOptions(npm, { publish: true, env: TOKEN_ENV }));
    expect(npm.calls.map((args) => args[0])).toEqual(['pack', 'publish', 'publish']);
    expect(npm.publishes()).toEqual([publishArgs({ dryRun: true }), publishArgs({ dryRun: false })]);
    expect(report.published).toBe(true);
  });

  it.each([true, false])('fails when the dry run resolves to registry.npmjs.org (publish: %s), without publishing', async (publish) => {
    const npm = recordingNpm({ registry: NPMJS });
    await expect(release(releaseOptions(npm, { publish, env: TOKEN_ENV }))).rejects.toThrow(
      /resolves the registry to https:\/\/registry\.npmjs\.org, expected https:\/\/npm\.pkg\.github\.com: nothing published/,
    );
    expect(npm.publishes()).toEqual([publishArgs({ dryRun: true })]);
    expect(npm.realPublishes()).toEqual([]);
  });

  it('fails when the dry run output names no registry, without publishing', async () => {
    const npm = recordingNpm({ registry: null });
    await expect(release(releaseOptions(npm, { publish: true, env: TOKEN_ENV }))).rejects.toThrow(/resolves the registry to unknown/);
    expect(npm.realPublishes()).toEqual([]);
  });

  it('fails before running npm when the real publish has no NODE_AUTH_TOKEN', async () => {
    const npm = recordingNpm();
    const fetchCoreVersions = vi.fn(() => FAKE_CORE_VERSIONS);
    await expect(release(releaseOptions(npm, { publish: true, env: {}, fetchCoreVersions }))).rejects.toThrow(/NODE_AUTH_TOKEN is not set/);
    expect(npm.calls).toEqual([]);
    expect(fetchCoreVersions).not.toHaveBeenCalled();
  });

  it('does not claim a publish when npm turned it into a dry run', async () => {
    const npm = recordingNpm({ realPublishOutput: publishLine(GITHUB_REGISTRY, true) });
    await expect(release(releaseOptions(npm, { publish: true, env: TOKEN_ENV }))).rejects.toThrow(/npm ran a dry run/);
  });

  it('a failed tarball check stops everything before npm publish', async () => {
    const badPack = () => ({ stdout: JSON.stringify([{ files: [{ path: 'package.json' }, { path: 'src/index.ts' }] }]) });
    const npm = recordingNpm({ packRunner: badPack });
    await expect(release(releaseOptions(npm, { publish: true, env: TOKEN_ENV }))).rejects.toThrow(/Tarball check failed[\s\S]*src\/index\.ts/);
    expect(npm.publishes()).toEqual([]);
  });

  it('a failing npm leaves no temporary directory (checked after every test, here on an npm error)', async () => {
    const npm = recordingNpm({
      packRunner: () => {
        throw new Error('npm pack failed (1)');
      },
    });
    await expect(release(releaseOptions(npm))).rejects.toThrow(/npm pack failed/);
    expect(leftovers()).toEqual([]);
  });
});

describe('SIGINT / SIGTERM during a release', () => {
  // A child process runs the CLI (`runCli`) on a fixture, with a fake npm whose `publish --dry-run` never returns; the
  // test signals it while the staging directory exists. Its TMPDIR is a directory of its own.
  const HARNESS = `
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const [scriptUrl, proDir] = process.argv.slice(2);
const { runCli } = await import(scriptUrl);
const list = (dir, base = '') => readdirSync(join(dir, base), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(dir, join(base, e.name)) : [join(base, e.name)]));
// Keeps the event loop alive while the fake dry run hangs, and ends the harness if no signal ever comes.
setTimeout(() => process.exit(99), 30_000);
const runNpm = (args, { cwd }) => {
  if (args[0] === 'pack') return { stdout: JSON.stringify([{ files: list(cwd).filter((p) => p !== '.npmrc').map((path) => ({ path })) }]) };
  if (args[0] === 'publish' && args.includes('--dry-run')) {
    process.stdout.write('READY ' + cwd + '\\n');
    return new Promise(() => {});
  }
  throw new Error('harness: unexpected npm ' + args.join(' '));
};
process.exit(await runCli([], { proDir, runNpm, fetchCoreVersions: () => ['0.1.0', '0.2.0'], stdout: () => {}, stderr: (t) => process.stderr.write(t + '\\n') }));
`;

  it.each([
    ['SIGTERM', 143],
    ['SIGINT', 130],
  ])('%s removes the staging directory and exits %i', async (signal, code) => {
    const dir = scratchDir('signal');
    const childTmp = join(dir, 'tmp');
    mkdirSync(childTmp);
    writeFileSync(join(dir, 'harness.mjs'), HARNESS);
    const child = spawn('node', [join(dir, 'harness.mjs'), pathToFileURL(SCRIPT).href, makeProFixture()], {
      env: { ...process.env, TMPDIR: childTmp },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    const exited = new Promise((resolveExit) => child.on('exit', (status, sig) => resolveExit({ status, sig })));
    try {
      const staged = await new Promise((resolveReady, reject) => {
        let stdout = '';
        child.stdout.setEncoding('utf8').on('data', (chunk) => {
          stdout += chunk;
          const match = /READY (\S+)/.exec(stdout);
          if (match) resolveReady(match[1]);
        });
        exited.then(() => reject(new Error(`the harness exited before the dry run:\n${stderr}`)));
      });
      expect(dirname(staged)).toBe(childTmp);
      expect(existsSync(join(staged, '.npmrc'))).toBe(true);
      child.kill(signal);
      expect(await exited).toEqual({ status: code, sig: null });
      expect(stderr).toContain(`${signal}: stopped, temporary files removed.`);
      expect(leftovers(childTmp)).toEqual([]);
    } finally {
      // A failed assertion before the signal must not leave the harness running.
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });
});

describe.skipIf(!hasDist)('the real packages/pro/dist (needs the build)', () => {
  it('the tarball holds dist/**, LICENSE, README.md and package.json only, with the published manifest', async () => {
    const staged = stage();
    try {
      const { files, tarball } = await pack(staged, scratchDir('pack'), realNpm({ writes: true }));
      expect(checkPackFiles(files)).toEqual([]);
      expect(files.some((f) => /\.test\.|\.stories\.|^src\/|\.npmrc/.test(f))).toBe(false);
      expect(files).toEqual(expect.arrayContaining(['LICENSE', 'README.md', 'package.json', 'dist/engine.js', 'dist/engine.cjs', 'dist/styles.css']));
      const manifest = JSON.parse(spawnSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' }).stdout);
      expect(manifest.name).toBe('@formrail-dev/pro');
      expect(manifest.private).toBeUndefined();
    } finally {
      rmSync(staged, { recursive: true, force: true });
    }
  });

  it('no sourcemap of the tarball names a path of the machine', async () => {
    const staged = stage();
    try {
      const { tarball, files } = await pack(staged, scratchDir('pack'), realNpm({ writes: true }));
      const maps = files.filter((f) => f.endsWith('.map'));
      expect(maps.length).toBeGreaterThan(0);
      for (const map of maps) {
        const text = spawnSync('tar', ['-xOzf', tarball, `package/${map}`], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout;
        expect(checkSourcemap(map, text)).toEqual([]);
        expect(text).not.toContain(ROOT);
      }
    } finally {
      rmSync(staged, { recursive: true, force: true });
    }
  });

  it('the real dist passes every check of the dry run (npm pack is real, npm publish is answered by the test)', async () => {
    const npm = recordingNpm();
    const report = await release({ runNpm: npm.run, fetchCoreVersions: () => FAKE_CORE_VERSIONS });
    expect(report.files).toEqual(expect.arrayContaining(['dist/engine.js', 'dist/index.js', 'LICENSE']));
    expect(npm.realPublishes()).toEqual([]);
  });

  // npm 11 does not enforce `private` under `--dry-run`, so a real `npm publish` is never run here. What is pinned:
  // `"private": true` stays in the source (npm refuses the real publish with EPRIVATE), and even a stray publish
  // attempt would never target the public npm registry (`publishConfig.registry`).
  it('the workspace stays "private": true, and its publishConfig sends a stray publish to GitHub, never to registry.npmjs.org', () => {
    expect(workspacePkg.private).toBe(true);
    expect(workspacePkg.publishConfig).toEqual({ registry: 'https://npm.pkg.github.com' });
  });
});

describe('the buyer side: the README .npmrc, and the tarball installed through the alias', () => {
  // The registry of the buyer is replaced by the local tarball (`file:` alias): the registry split is checked on the
  // `.npmrc` of the README, the install and the imports on the tarball. No access to GitHub, no token.
  const npmrcFromReadme = () => {
    const [block] = iniBlocks(section('## Install (licensed teams)', '## Release (maintainers)'));
    expect(block).toBeDefined();
    return block;
  };

  it('the README .npmrc points only the @formrail-dev scope to GitHub, with the token from the environment, also under another project', () => {
    const npmrc = npmrcFromReadme();
    expect(npmrc).toContain('@formrail-dev:registry=https://npm.pkg.github.com');
    expect(npmrc).toContain('//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}');
    expect(npmrc).not.toMatch(/^@formrail:registry/m);
    expect(npmrc).not.toMatch(/_authToken=(?!\$\{)/);

    // The buyer's project sits inside another npm project (e.g. a TMPDIR under a checkout): `--prefix` makes npm
    // read the `.npmrc` of the buyer's directory, whatever is above it.
    const outer = scratchDir('outer-project');
    writeFileSync(join(outer, 'package.json'), '{"name":"outer","private":true}');
    const buyer = join(outer, 'buyer');
    mkdirSync(buyer);
    writeFileSync(join(buyer, '.npmrc'), npmrc);
    const get = (key, args) => realNpm({ env: TOKEN_ENV })(['config', 'get', key, ...args], { cwd: buyer }).stdout.trim();
    // Without --prefix npm takes the outer project as the root and never reads the buyer's .npmrc: the trap is real.
    expect(get('@formrail-dev:registry', [])).toBe('undefined');
    expect(get('@formrail-dev:registry', ['--prefix', buyer])).toBe('https://npm.pkg.github.com');
    expect(get('@formrail:registry', ['--prefix', buyer])).toBe('undefined');
  });

  it.skipIf(!hasDist)('installs the tarball as @formrail/pro and @formrail/pro/engine works with ESM and CJS, without the core', async () => {
    const staged = stage();
    let tarball;
    try {
      ({ tarball } = await pack(staged, scratchDir('pack'), realNpm({ writes: true })));
    } finally {
      rmSync(staged, { recursive: true, force: true });
    }

    const project = scratchDir('buyer');
    writeFileSync(
      join(project, 'package.json'),
      JSON.stringify({ name: 'buyer', private: true, type: 'module', dependencies: { '@formrail/pro': `file:${tarball}` } }),
    );
    realNpm({ writes: true })(['install', '--prefix', project, '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: project });
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
