import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEC, resolveSpec, SUITE_ARGS } from './tanstack-compat.mjs';

// Ticket #563 (decision B): the weekly TanStack Form compatibility run never leaves 1.x, and stays out of the
// required checks of main.

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('resolveSpec: the run stays on 1.x', () => {
  it('defaults to ^1 (newest 1.x, even after a 2.0 is published)', () => {
    expect(DEFAULT_SPEC).toBe('^1');
    expect(resolveSpec(undefined)).toBe('^1');
    expect(resolveSpec('  ')).toBe('^1');
  });

  it.each(['1.33.5', '~1.33.5', '^1', '1', '1.20.0', '^1.30.0', '1.34.0-beta.1'])('accepts %s', (spec) => {
    expect(resolveSpec(spec)).toBe(spec);
  });

  it.each(['latest', 'next', 'alpha', '2', '2.0.0-alpha.3', '^2', '>=1', '*', '1 || 2', '0.9.0', '1.x;rm -rf /'])(
    'refuses %s',
    (spec) => {
      expect(() => resolveSpec(spec)).toThrow(/inside 1\.x/);
    },
  );
});

describe('the suite', () => {
  it('runs the files of the TanStack binding with the exclusion of one assertion on the installed version', () => {
    expect(SUITE_ARGS.slice(0, 2)).toEqual(['tanstack-form', '-t']);
  });

  // The real thing: vitest, from packages/pro, with the very SUITE_ARGS of the script, but only LISTING the tests
  // (nothing is executed). Vitest joins describe and it with " > " in the name the pattern is matched against; a
  // pattern with another separator skips nothing, and only a real vitest can tell.
  it('skips exactly one test, the one on the installed version, and keeps the rest', () => {
    const cwd = fileURLToPath(new URL('../packages/pro/', import.meta.url));
    const listed = (args) => {
      const r = spawnSync('npx', ['vitest', 'list', ...args, '--json'], { cwd, encoding: 'utf8', timeout: 120_000 });
      expect(r.error).toBeUndefined();
      expect(r.status, r.stderr).toBe(0);
      return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));
    };
    const all = listed([SUITE_ARGS[0]]);
    const kept = listed(SUITE_ARGS);
    const keptNames = new Set(kept.map((t) => `${t.file}::${t.name}`));
    const dropped = all.filter((t) => !keptNames.has(`${t.file}::${t.name}`));
    expect(dropped.map((t) => t.name)).toEqual([
      'TanStack Form 1.33.5: the installed version > is the tested minimum of the peer range, which accepts its minor only (~)',
    ]);
    expect(kept.length).toBeGreaterThan(100);
  }, 150_000);
});

// The failure path, with stub npm and npx first in the PATH: the script must exit 1 when the install or vitest
// fails, and 0 only when both pass. The workflow is silent about everything else, so this is what keeps the weekly
// job honest.
describe('the script exit code', () => {
  const script = fileURLToPath(new URL('./tanstack-compat.mjs', import.meta.url));
  const runWith = ({ npm, npx }) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tanstack-compat-stubs-'));
    const log = path.join(dir, 'calls.log');
    for (const [name, code] of [
      ['npm', npm],
      ['npx', npx],
    ]) {
      const file = path.join(dir, name);
      // `code` is an exit status, or 'kill' to die by signal (`kill -9 $$`): spawnSync then reports status null.
      const end = code === 'kill' ? 'kill -9 $$' : `exit ${code}`;
      writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> "${log}"\n${end}\n`);
      chmodSync(file, 0o755);
    }
    const r = spawnSync(process.execPath, [script, '1.33.5'], {
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` },
    });
    let calls = '';
    try {
      calls = readFileSync(log, 'utf8');
    } catch {
      // no stub was called
    }
    rmSync(dir, { recursive: true, force: true });
    return { status: r.status, calls, out: r.stdout + r.stderr };
  };

  it('exits 0 when the install and the tests pass', () => {
    const r = runWith({ npm: 0, npx: 0 });
    expect(r.status).toBe(0);
    expect(r.calls).toMatch(/^npm install .*@tanstack\/react-form@1\.33\.5/m);
    expect(r.calls).toMatch(/^npx vitest run tanstack-form -t /m);
    expect(r.out).toContain('PASS');
  });

  it('installs without saving, into the Pro workspace, the exact spec (package.json and lockfile stay as they are)', () => {
    const r = runWith({ npm: 0, npx: 0 });
    const install = r.calls.split('\n').find((l) => l.startsWith('npm install'));
    expect(install).toBeDefined();
    expect(install).toMatch(/ --no-save( |$)/);
    expect(install).toMatch(/ --workspace packages\/pro /);
    expect(install).toMatch(/ @tanstack\/react-form@1\.33\.5$/);
    expect(install).not.toMatch(/ (--save|-S|--save-dev|-D|--global|-g)( |$)/);
  });

  // `spawnSync` gives `status: null` when the child dies by signal: `?? 1` turns it into a failure, `?? 0` into a
  // pass. Only a stub that kills itself tells the two apart.
  it('exits 1 when vitest is killed by a signal (status null is a failure, never a pass)', () => {
    const r = runWith({ npm: 0, npx: 'kill' });
    expect(r.calls).toContain('npx vitest run');
    expect(r.status).toBe(1);
    expect(r.out).toContain('FAIL');
    expect(r.out).not.toContain('PASS');
  });

  it('exits 1 when the install is killed by a signal, and runs no test', () => {
    const r = runWith({ npm: 'kill', npx: 0 });
    expect(r.status).toBe(1);
    expect(r.calls).not.toContain('npx');
  });

  it('exits 1 when the tests fail', () => {
    const r = runWith({ npm: 0, npx: 1 });
    expect(r.status).toBe(1);
    expect(r.out).toContain('FAIL');
  });

  it('exits non-zero when the install fails, and runs no test', () => {
    const r = runWith({ npm: 3, npx: 0 });
    expect(r.status).toBe(3);
    expect(r.calls).not.toContain('npx');
  });
});

describe('the workflow', () => {
  // Comments dropped: they explain what the workflow does not do (no pull_request, no write token).
  const yml = read('.github/workflows/tanstack-compat.yml').replace(/^\s*#.*$/gm, '');

  it('is scheduled weekly and can be run by hand with a version', () => {
    expect(yml).toMatch(/schedule:\s*\n\s*- cron: '[^']+'/);
    expect(yml).toMatch(/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*version:/);
  });

  it('is separate from the required CI: does not run on pull requests and is not the CI workflow', () => {
    expect(yml).not.toMatch(/pull_request/);
    expect(yml).toMatch(/^name: TanStack Form compat$/m);
    expect(yml).not.toMatch(/^name: CI$/m);
  });

  it('has the minimum permissions: read-only token, no write scope', () => {
    // The whole block, exactly: an extra read scope (e.g. actions: read) fails too.
    expect(/^permissions:\n((?: {2}\S.*\n)+)/m.exec(yml)[1]).toBe('  contents: read\n');
    expect(yml).not.toMatch(/:\s*write/);
  });

  it('runs the script of this repo, which stays on 1.x', () => {
    expect(yml).toContain('node scripts/tanstack-compat.mjs');
  });

  it('makes a failing script fail the step (pipefail) and takes the version from the input through env only', () => {
    const step = /- name: Run the TanStack[\s\S]*?(?=\n {6}- name:|$)/.exec(yml)[0];
    expect(step).toMatch(/set -o pipefail|shell: bash/);
    expect(step).toMatch(/env:\s*\n\s+VERSION: \$\{\{ inputs\.version \}\}/);
    expect(step).toContain('"$VERSION"');
  });

  // Ticket #573: the three ways to make a red run green without touching the script. Asserted on the YAML without
  // comments, which explain what the workflow does not do.
  it('has no way to swallow a failure: no continue-on-error, no `|| true`, no `set +o pipefail`, no `set +e`', () => {
    expect(yml).not.toMatch(/continue-on-error/);
    expect(yml).not.toMatch(/\|\|\s*(true|:|exit\s+0)\b/);
    expect(yml).not.toMatch(/set\s+\+o\s+pipefail/);
    expect(yml).not.toMatch(/set\s+\+[a-z]*e\b/);
  });

  it('the run step is not made optional by an `if:` that could skip it', () => {
    const step = /- name: Run the TanStack[\s\S]*?(?=\n {6}- name:|$)/.exec(yml)[0];
    expect(step).not.toMatch(/^\s+if:/m);
  });

  it('the Summary reads the log the run step wrote: stderr merged in, and `tee` to the same file', () => {
    const run = /- name: Run the TanStack[\s\S]*?(?=\n {6}- name:|$)/.exec(yml)[0];
    const summary = /- name: Summary[\s\S]*$/.exec(yml)[0];
    // `2>&1` before the pipe: the failing lines of vitest go to stderr and must reach the log.
    expect(run).toMatch(/node scripts\/tanstack-compat\.mjs "\$VERSION" 2>&1 \| tee compat\.log\s*$/m);
    const teeTarget = /\| tee (\S+)/.exec(run)[1];
    const grepTarget = /grep -E '[^']+' (\S+)/.exec(summary)[1];
    expect(teeTarget).toBe('compat.log');
    expect(grepTarget).toBe(teeTarget);
    // The summary lines are the ones the script prints with that prefix.
    expect(summary).toMatch(/grep -E '\^tanstack-compat:'/);
    expect(summary).toContain('"$GITHUB_STEP_SUMMARY"');
  });

  it('never interpolates an expression into a shell command (script injection)', () => {
    const runs = [...yml.matchAll(/^\s*(?:- )?run: (\|\s*\n(?:\s{10,}.*\n?)+|.*)/gm)].map((m) => m[1]);
    expect(runs.length).toBeGreaterThan(3);
    for (const run of runs) expect(run).not.toContain('${{');
  });

  it('writes the summary even when the run failed (if: always())', () => {
    expect(yml).toMatch(/- name: Summary\n\s+if: always\(\)/);
  });

  it('does not keep the token in the checkout (persist-credentials: false)', () => {
    expect(yml).toMatch(/actions\/checkout@v\d+\n\s+with:\n\s+persist-credentials: false/);
  });

  it('does not touch the job names of the required CI', () => {
    const ci = read('.github/workflows/ci.yml');
    for (const name of ['lint', 'typecheck', 'build']) expect(ci).toContain(`name: ${name}`);
    expect(yml).not.toMatch(/^ {2}(lint|typecheck|build|test|e2e|visual):/m);
  });
});
