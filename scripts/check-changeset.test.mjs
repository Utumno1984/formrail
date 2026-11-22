import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectChangedFiles, evaluateChangesetGate, onlyVersionChanged, parseNameStatus } from './check-changeset.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'check-changeset.mjs');

describe('evaluateChangesetGate', () => {
  it('fails when a package file changes without a changeset, with actionable guidance', () => {
    const r = evaluateChangesetGate(['packages/core/src/index.ts']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('npx changeset');
    expect(r.message).toContain('npx changeset --empty');
    expect(r.message).toContain('packages/core/src/index.ts');
  });

  it('passes when a package file changes together with an added changeset', () => {
    const r = evaluateChangesetGate(['packages/core/src/index.ts', '.changeset/brave-lions-run.md']);
    expect(r.ok).toBe(true);
  });

  it('rejects a PR touching only packages/pro/src without a changeset (pro is gated like core)', () => {
    const r = evaluateChangesetGate([
      'packages/pro/src/change-summary/compute-change-summary.ts',
      { status: 'M', path: 'packages/pro/src/index.ts' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('packages/pro/src/change-summary/compute-change-summary.ts');
    expect(r.packageFiles).toEqual(['packages/pro/src/change-summary/compute-change-summary.ts', 'packages/pro/src/index.ts']);
    expect(evaluateChangesetGate(['packages/pro/src/index.ts', '.changeset/pro-change.md']).ok).toBe(true);
  });

  it('passes for docs/.github/scripts-only changes without changeset', () => {
    expect(
      evaluateChangesetGate(['docs/a.md', '.github/workflows/ci.yml', 'scripts/x.mjs', 'README.md']).ok,
    ).toBe(true);
  });

  it('passes for an empty diff', () => {
    expect(evaluateChangesetGate([]).ok).toBe(true);
  });

  it('requires a changeset for a deleted package file', () => {
    expect(evaluateChangesetGate([{ status: 'D', path: 'packages/core/src/old.ts' }]).ok).toBe(false);
  });

  it('requires a changeset for a rename (old and new paths both listed)', () => {
    const files = parseNameStatus('D\0packages/core/src/a.ts\0A\0packages/core/src/b.ts\0');
    expect(files).toHaveLength(2);
    expect(evaluateChangesetGate(files).ok).toBe(false);
  });

  it('requires a changeset for a rename moving a file out of packages/*', () => {
    const files = parseNameStatus('D\0packages/core/src/a.ts\0A\0docs/a.ts\0');
    expect(evaluateChangesetGate(files).ok).toBe(false);
  });

  it('requires a changeset for test-only changes under packages/*', () => {
    const r = evaluateChangesetGate(['packages/core/test/compose-refs.test.tsx']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('test-only');
  });

  it('does not count .changeset/README.md or non-markdown files as a changeset', () => {
    expect(evaluateChangesetGate(['packages/core/a.ts', '.changeset/README.md']).ok).toBe(false);
    expect(evaluateChangesetGate(['packages/core/a.ts', '.changeset/config.json']).ok).toBe(false);
  });

  it('does not count a deleted changeset', () => {
    const files = [
      { status: 'M', path: 'packages/core/a.ts' },
      { status: 'D', path: '.changeset/old.md' },
    ];
    expect(evaluateChangesetGate(files).ok).toBe(false);
  });

  it('is decided only from the given diff: a changeset already on main is not in the list', () => {
    // The CLI diffs merge-base..HEAD, so a pre-existing .changeset/initial-core-scaffold.md is absent.
    expect(evaluateChangesetGate(['packages/core/src/new.ts']).ok).toBe(false);
  });

  it('does not count a modified changeset (it already existed on the base branch)', () => {
    const files = [
      { status: 'M', path: 'packages/core/a.ts' },
      { status: 'M', path: '.changeset/initial-core-scaffold.md' },
    ];
    expect(evaluateChangesetGate(files).ok).toBe(false);
    expect(evaluateChangesetGate([{ status: 'T', path: '.changeset/x.md' }, 'packages/core/a.ts']).ok).toBe(false);
  });

  it('requires a valid frontmatter in the added changeset when content is readable', () => {
    const files = ['packages/core/a.ts', '.changeset/x.md'];
    const gate = (content) => evaluateChangesetGate(files, () => content).ok;
    expect(gate('---\n---\n\nEmpty changeset\n')).toBe(true);
    expect(gate("---\n'@formrail/core': patch\n---\n\nFix\n")).toBe(true);
    expect(gate('')).toBe(false);
    expect(gate('Just text, no frontmatter\n')).toBe(false);
    expect(gate('---\nunterminated\n')).toBe(false);
    expect(gate(null)).toBe(false);
  });
});

describe('evaluateChangesetGate: release PR exemption', () => {
  const pkg = (o = {}) => JSON.stringify({ name: '@formrail/core', version: '0.1.0', dependencies: { a: '1' }, ...o }, null, 2);
  const base = { 'packages/core/package.json': pkg() };
  const head = { 'packages/core/package.json': pkg({ version: '0.2.0' }) };
  const release = [
    { status: 'M', path: 'packages/core/package.json' },
    { status: 'M', path: 'packages/core/CHANGELOG.md' },
    { status: 'D', path: '.changeset/brave-lions.md' },
  ];
  const run = (files, h = head, b = base) =>
    evaluateChangesetGate(files, (p) => h[p] ?? null, (p) => b[p] ?? null);

  it('exempts version + CHANGELOG with consumed changesets and says why', () => {
    const r = run(release);
    expect(r.ok).toBe(true);
    expect(r.exempt).toBe(true);
    expect(r.message).toContain('exemption applied');
    expect(r.message).toContain('only the `version` field');
    expect(r.message).toContain('consumed');
    expect(r.message).toContain('no changeset was added');
  });

  it('exempts an added CHANGELOG and several packages and deleted changesets', () => {
    const files = [
      { status: 'M', path: 'packages/core/package.json' },
      { status: 'M', path: 'packages/pro/package.json' },
      { status: 'A', path: 'packages/pro/CHANGELOG.md' },
      { status: 'D', path: '.changeset/a.md' },
      { status: 'D', path: '.changeset/b.md' },
      { status: 'M', path: '.changeset/config.json' },
    ];
    const h = { ...head, 'packages/pro/package.json': pkg({ name: 'p', version: '2.0.0' }) };
    const b = { ...base, 'packages/pro/package.json': pkg({ name: 'p', version: '1.0.0' }) };
    expect(run(files, h, b).exempt).toBe(true);
  });

  it('is not exempt when version changes together with another field', () => {
    for (const extra of [{ dependencies: { a: '2' } }, { exports: './x.js' }, { name: '@formrail/other' }]) {
      const r = run(release, { 'packages/core/package.json': pkg({ version: '0.2.0', ...extra }) });
      expect(r.ok).toBe(false);
      expect(r.exempt).toBeUndefined();
      expect(r.message).toContain('npx changeset');
    }
  });

  it('is not exempt when another field changes and version does not', () => {
    expect(run(release, { 'packages/core/package.json': pkg({ dependencies: { a: '2' } }) }).ok).toBe(false);
  });

  it('is not exempt when a source file is touched', () => {
    expect(run([...release, { status: 'M', path: 'packages/core/src/index.ts' }]).ok).toBe(false);
  });

  it('is not exempt when one changeset is deleted and another added (normal rule applies)', () => {
    const files = [...release, { status: 'A', path: '.changeset/new.md' }];
    const r = evaluateChangesetGate(files, (p) => (p === '.changeset/new.md' ? '---\n---\n' : head[p]), (p) => base[p]);
    expect(r.ok).toBe(true);
    expect(r.exempt).toBeUndefined();
    expect(r.message).toContain('Changeset found');
    const bad = evaluateChangesetGate(files, (p) => (p === '.changeset/new.md' ? 'no' : head[p]), (p) => base[p]);
    expect(bad.ok).toBe(false);
  });

  it('is not exempt without a deleted changeset (README does not count)', () => {
    expect(run(release.slice(0, 2)).ok).toBe(false);
    expect(run([...release.slice(0, 2), { status: 'D', path: '.changeset/README.md' }]).ok).toBe(false);
    expect(run([...release.slice(0, 2), { status: 'M', path: '.changeset/x.md' }]).ok).toBe(false);
  });

  it('is not exempt when package.json is added or deleted', () => {
    for (const status of ['A', 'D']) {
      const files = [{ status, path: 'packages/core/package.json' }, release[2]];
      expect(run(files).ok).toBe(false);
    }
  });

  it('is not exempt for a CHANGELOG-only change, a deleted CHANGELOG or lookalike files', () => {
    expect(run([release[1], release[2]]).ok).toBe(false);
    expect(run([release[0], { status: 'D', path: 'packages/core/CHANGELOG.md' }, release[2]]).ok).toBe(false);
    for (const path of ['packages/core/CHANGELOG.md.bak', 'packages/core/docs/CHANGELOG.md', 'packages/core/src/package.json']) {
      expect(run([release[0], { status: 'M', path }, release[2]]).ok).toBe(false);
    }
  });

  it('is not exempt without a base reader, or on invalid JSON', () => {
    expect(evaluateChangesetGate(release, (p) => head[p] ?? null).ok).toBe(false);
    expect(run(release, { 'packages/core/package.json': '{ not json' }).ok).toBe(false);
    expect(run(release, head, { 'packages/core/package.json': null }).ok).toBe(false);
  });

  it('keeps the plain "no package files" result when only changesets are deleted', () => {
    const r = run([{ status: 'D', path: '.changeset/a.md' }]);
    expect(r.ok).toBe(true);
    expect(r.exempt).toBeUndefined();
    expect(r.message).toContain('No file under packages/*');
  });

  describe('workspace-internal ranges', () => {
    const core = (v) => JSON.stringify({ name: '@formrail/core', version: v });
    const proJson = (o = {}, version = '0.2.0') =>
      JSON.stringify({
        name: '@formrail/pro',
        version,
        peerDependencies: { '@formrail/core': '0.2.0', react: '^18.0.0' },
        devDependencies: { '@formrail/core': '^0.2.0', vitest: '^3.0.0' },
        ...o,
      });
    const baseWith = {
      'packages/core/package.json': core('0.1.0'),
      'packages/pro/package.json': proJson(
        {
          peerDependencies: { '@formrail/core': '0.1.0', react: '^18.0.0' },
          devDependencies: { '@formrail/core': '^0.1.0', vitest: '^3.0.0' },
        },
        '0.1.0',
      ),
    };
    const headWith = { 'packages/core/package.json': core('0.2.0'), 'packages/pro/package.json': proJson() };
    const files = [
      { status: 'M', path: 'packages/core/package.json' },
      { status: 'M', path: 'packages/pro/package.json' },
      { status: 'D', path: '.changeset/a.md' },
    ];
    const go = (proHead, coreHead = headWith['packages/core/package.json']) =>
      run(files, { 'packages/core/package.json': coreHead, 'packages/pro/package.json': proHead }, baseWith);

    it('exempts internal ranges aligned to the new version in peer and dev dependencies', () => {
      expect(go(proJson()).exempt).toBe(true);
    });

    it('is not exempt when an internal range points to the wrong version', () => {
      expect(go(proJson({ peerDependencies: { '@formrail/core': '0.3.0', react: '^18.0.0' } })).ok).toBe(false);
      expect(go(proJson({ devDependencies: { '@formrail/core': '^0.1.5', vitest: '^3.0.0' } })).ok).toBe(false);
    });

    it('is not exempt when the range prefix changes', () => {
      expect(go(proJson({ devDependencies: { '@formrail/core': '~0.2.0', vitest: '^3.0.0' } })).ok).toBe(false);
      expect(go(proJson({ peerDependencies: { '@formrail/core': '^0.2.0', react: '^18.0.0' } })).ok).toBe(false);
    });

    it('is not exempt when an external dependency changes with the version', () => {
      expect(go(proJson({ devDependencies: { '@formrail/core': '^0.2.0', vitest: '^4.0.0' } })).ok).toBe(false);
    });

    it('is not exempt when an internal entry is added or removed', () => {
      expect(
        go(proJson({ dependencies: { '@formrail/core': '0.2.0' } })).ok,
      ).toBe(false);
      expect(go(proJson({ devDependencies: { vitest: '^3.0.0' } })).ok).toBe(false);
    });

    it('is not exempt when the internal package version does not change but the range does', () => {
      expect(go(proJson(), core('0.1.0')).ok).toBe(false);
    });

    const goBase = (proBase, proHead = proJson()) =>
      run(
        files,
        { 'packages/core/package.json': core('0.2.0'), 'packages/pro/package.json': proHead },
        { 'packages/core/package.json': core('0.1.0'), 'packages/pro/package.json': proBase },
      );
    const proBase = (o = {}) => proJson(o, '0.1.0');

    it('exempts an aligned internal range in dependencies (exact, caret and tilde)', () => {
      for (const [from, to] of [['0.1.0', '0.2.0'], ['^0.1.0', '^0.2.0'], ['~0.1.0', '~0.2.0']]) {
        const r = goBase(
          proBase({ dependencies: { '@formrail/core': from } }),
          proJson({ dependencies: { '@formrail/core': to } }),
        );
        expect(r.exempt).toBe(true);
      }
    });

    it('is not exempt when an internal range of another shape is rewritten to the new exact version', () => {
      for (const from of ['>=0.1.0', '*', 'workspace:^0.1.0', 'file:../core', 'github:x/y', 'npm:react@18', '^9.9.9', '0.0.5']) {
        expect(goBase(proBase({ peerDependencies: { '@formrail/core': from } })).ok).toBe(false);
      }
      expect(goBase(proBase({ devDependencies: { '@formrail/core': '^9.9.9' } })).ok).toBe(false);
    });

    it('is not exempt when a non-standard range keeps its shape but follows the new version', () => {
      const r = goBase(
        proBase({ peerDependencies: { '@formrail/core': '>=0.1.0' } }),
        proJson({ peerDependencies: { '@formrail/core': '>=0.2.0' } }),
      );
      expect(r.ok).toBe(false);
    });

    it('is not exempt when an external dependency is added to an existing devDependencies', () => {
      const r = goBase(proBase(), proJson({ devDependencies: { '@formrail/core': '^0.2.0', vitest: '^3.0.0', zod: '^3.0.0' } }));
      expect(r.ok).toBe(false);
    });

    it('is not exempt when a base dependency value is not a string', () => {
      const r = goBase(proBase({ devDependencies: { '@formrail/core': { v: 1 }, vitest: '^3.0.0' } }));
      expect(r.ok).toBe(false);
    });

    it('is not exempt for aligned ranges in optionalDependencies, overrides or resolutions', () => {
      for (const field of ['optionalDependencies', 'overrides', 'resolutions']) {
        const r = goBase(
          proBase({ [field]: { '@formrail/core': '0.1.0' } }),
          proJson({ [field]: { '@formrail/core': '0.2.0' } }),
        );
        expect(r.ok).toBe(false);
      }
    });
  });

  it('is not exempt when package.json gains a version it did not have', () => {
    const noVersion = JSON.stringify({ name: '@formrail/core' });
    expect(run(release, head, { 'packages/core/package.json': noVersion }).ok).toBe(false);
  });

  it('is not exempt for a lowercase changelog.md or a nested package.json with only a version bump', () => {
    expect(run([release[0], { status: 'A', path: 'packages/core/changelog.md' }, release[2]]).ok).toBe(false);
    const nested = 'packages/core/src/package.json';
    const files = [release[0], { status: 'M', path: nested }, release[2]];
    const withNested = (v) => ({ ...head, [nested]: JSON.stringify({ name: 'n', version: v }) });
    const baseNested = { ...base, [nested]: JSON.stringify({ name: 'n', version: '1.0.0' }) };
    expect(run(files, withNested('1.1.0'), baseNested).ok).toBe(false);
  });

  it('requires the new version to be a valid semver strictly greater than the base', () => {
    const go = (from, to) =>
      run(release, { 'packages/core/package.json': pkg({ version: to }) }, { 'packages/core/package.json': pkg({ version: from }) }).ok;
    expect(go('0.1.0', '0.2.0')).toBe(true);
    expect(go('0.1.0', '0.1.1')).toBe(true);
    expect(go('0.2.0-next.1', '0.2.0-next.2')).toBe(true);
    expect(go('0.2.0-next.1', '0.2.0')).toBe(true);
    expect(go('0.9.0', '0.10.0')).toBe(true);
    expect(go('0.1.0', 'banana')).toBe(false);
    expect(go('0.1.0', '2')).toBe(false);
    expect(go('0.1.0', 2)).toBe(false);
    expect(go('0.2.0', '0.1.0')).toBe(false);
    expect(go('0.2.0', '0.2.0')).toBe(false);
    expect(go('0.2.0', '0.2.0-next.1')).toBe(false);
    expect(go('0.1.0', '0.1.0+build')).toBe(false);
    expect(go('0.1.0', '1.0')).toBe(false);
    // prerelease precedence and edge shapes
    expect(go('1.0.0-alpha', '1.0.0-alpha.1')).toBe(true);
    expect(go('1.0.0-1', '1.0.0-a')).toBe(true);
    expect(go('1.0.0-a', '1.0.0-1')).toBe(false);
    expect(go('1.0.0-beta.2', '1.0.0-beta.11')).toBe(true);
    expect(go('1.0.0-beta.11', '1.0.0-beta.2')).toBe(false);
    expect(go('0.1.0', '0.2.0banana')).toBe(false);
    expect(go('0.1.0', '0.1.1+build')).toBe(true);
    expect(go('banana', '0.2.0')).toBe(false);
    expect(go('0.1.0', ['0.2.0'])).toBe(false);
  });

  it('lists the bumped packages with from and to in the exemption message', () => {
    const r = run(release);
    expect(r.message).toContain('@formrail/core 0.1.0 → 0.2.0');
  });

  it('compares parsed JSON: reformatting and key order neither hide nor fake a change', () => {
    const a = '{"name":"x","version":"1.0.0","files":["a"]}';
    expect(onlyVersionChanged(a, '{\n  "files": ["a"],\n  "version": "2.0.0",\n  "name": "x"\n}')).toBe(true);
    expect(onlyVersionChanged(a, '{"name":"x","version":"2.0.0","files":["b"]}')).toBe(false);
    expect(onlyVersionChanged(a, a)).toBe(false);
    expect(onlyVersionChanged(a, '{"name":"x","version":"2.0.0"}')).toBe(false);
    expect(onlyVersionChanged(a, '[]')).toBe(false);
  });
});

describe('collectChangedFiles (real git repository)', () => {
  let dir;
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const write = (rel, content = 'x\n') => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'changeset-gate-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'T');
    git('config', 'commit.gpgsign', 'false');
    write('packages/core/src/keep.ts');
    write('packages/core/src/old.ts');
    write('packages/core/src/rename-me.ts', 'rename me, long enough content to detect\n'.repeat(5));
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('switch', '-q', '-c', 'feature');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const collect = (baseRef = 'main') => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      return collectChangedFiles(baseRef);
    } finally {
      process.chdir(cwd);
    }
  };

  it('reports deletions, renames (as delete + add), spaces and unicode paths verbatim', () => {
    git('rm', '-q', 'packages/core/src/old.ts');
    git('mv', 'packages/core/src/rename-me.ts', 'packages/core/src/renamed.ts');
    write('packages/core/src/with space.ts');
    write('packages/core/src/città-ü.ts');
    git('add', '-A');
    git('commit', '-q', '-m', 'change');
    const files = collect();
    expect(files).toEqual(
      expect.arrayContaining([
        { status: 'D', path: 'packages/core/src/old.ts' },
        { status: 'D', path: 'packages/core/src/rename-me.ts' },
        { status: 'A', path: 'packages/core/src/renamed.ts' },
        { status: 'A', path: 'packages/core/src/with space.ts' },
        { status: 'A', path: 'packages/core/src/città-ü.ts' },
      ]),
    );
    expect(files).toHaveLength(5);
    expect(evaluateChangesetGate(files).ok).toBe(false);
  });

  it('diffs against the merge-base, ignoring later commits on the base branch', () => {
    write('packages/core/src/feature.ts');
    git('add', '-A');
    git('commit', '-q', '-m', 'feature');
    git('switch', '-q', 'main');
    write('packages/core/src/on-main.ts');
    git('add', '-A');
    git('commit', '-q', '-m', 'main moves on');
    git('switch', '-q', 'feature');
    expect(collect()).toEqual([{ status: 'A', path: 'packages/core/src/feature.ts' }]);
  });

  it('exits with a non-zero code when BASE_REF does not exist', () => {
    const r = spawnSync(process.execPath, [script], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, BASE_REF: 'origin/does-not-exist' },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Cannot compute the merge-base');
  });

  it('CLI: fails on a modified changeset and passes on an added valid one', () => {
    write('.changeset/old.md', '---\n---\n\nold\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'changeset on base');
    git('switch', '-q', 'main');
    git('merge', '-q', '--ff-only', 'feature');
    git('switch', '-q', '-c', 'pr');
    write('packages/core/src/new.ts');
    write('.changeset/old.md', '---\n---\n\nedited\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'pr');
    const run = () =>
      spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, BASE_REF: 'main' } });
    expect(run().status).toBe(1);
    write('.changeset/new.md', 'no frontmatter\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'bad changeset');
    expect(run().status).toBe(1);
    write('.changeset/new.md', '---\n---\n\nok\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'good changeset');
    expect(run().status).toBe(0);
  });

  it('CLI: exempts a release PR (version + CHANGELOG, changeset consumed) and rejects an extra field', () => {
    const pkgJson = (o = {}) => JSON.stringify({ name: '@formrail/core', version: '0.1.0', ...o }, null, 2) + '\n';
    write('packages/core/package.json', pkgJson());
    write('packages/core/CHANGELOG.md', '# core\n');
    write('.changeset/pending.md', "---\n'@formrail/core': minor\n---\n\nFeature\n");
    git('add', '-A');
    git('commit', '-q', '-m', 'base with changeset');
    git('switch', '-q', 'main');
    git('merge', '-q', '--ff-only', 'feature');
    git('switch', '-q', '-c', 'release');
    write('packages/core/package.json', pkgJson({ version: '0.2.0' }));
    write('packages/core/CHANGELOG.md', '# core\n\n## 0.2.0\n');
    git('rm', '-q', '.changeset/pending.md');
    git('add', '-A');
    git('commit', '-q', '-m', 'release');
    const run = () =>
      spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, BASE_REF: 'main' } });
    const ok = run();
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('exemption applied');
    write('packages/core/package.json', pkgJson({ version: '0.2.0', private: true }));
    git('add', '-A');
    git('commit', '-q', '-m', 'extra field');
    const ko = run();
    expect(ko.status).toBe(1);
    expect(ko.stderr).toContain('npx changeset');
    git('reset', '-q', '--hard', 'HEAD~1');
    // pro aligns its internal range to core's new version, as `changeset version` does.
    write('packages/pro/package.json', JSON.stringify({ name: '@formrail/pro', version: '0.1.0', peerDependencies: { '@formrail/core': '0.1.0' } }, null, 2) + '\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'pro on base');
    git('switch', '-q', 'main');
    git('merge', '-q', '--ff-only', 'release');
    git('switch', '-q', '-c', 'release2');
    write('packages/core/package.json', pkgJson({ version: '0.3.0' }));
    write('packages/pro/package.json', JSON.stringify({ name: '@formrail/pro', version: '0.2.0', peerDependencies: { '@formrail/core': '0.3.0' } }, null, 2) + '\n');
    write('.changeset/second.md', '---\n---\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'second changeset base');
    git('switch', '-q', 'main');
    git('merge', '-q', '--ff-only', 'release2');
    git('switch', '-q', '-c', 'release3');
    write('packages/core/package.json', pkgJson({ version: '0.4.0' }));
    write('packages/pro/package.json', JSON.stringify({ name: '@formrail/pro', version: '0.3.0', peerDependencies: { '@formrail/core': '0.4.0' } }, null, 2) + '\n');
    git('rm', '-q', '.changeset/second.md');
    git('add', '-A');
    git('commit', '-q', '-m', 'release with internal range');
    const withRange = run();
    expect(withRange.status).toBe(0);
    expect(withRange.stdout).toContain('exemption applied');
    write('packages/pro/package.json', JSON.stringify({ name: '@formrail/pro', version: '0.3.0', peerDependencies: { '@formrail/core': '0.9.0' } }, null, 2) + '\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'wrong range');
    expect(run().status).toBe(1);
  });
});
