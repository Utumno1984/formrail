import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectChangedFiles, evaluateChangesetGate, parseNameStatus } from './check-changeset.mjs';

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
});
