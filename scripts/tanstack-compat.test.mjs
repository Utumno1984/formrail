import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  // The real thing: vitest, from packages/pro, with the very SUITE_ARGS of the script. Vitest joins describe and it
  // with " > " in the name the pattern is matched against; a pattern with another separator skips nothing, and only
  // a real run can tell.
  it('skips exactly one test, the one on the installed version, and runs the rest', () => {
    const cwd = fileURLToPath(new URL('../packages/pro/', import.meta.url));
    const dir = mkdtempSync(path.join(tmpdir(), 'tanstack-compat-'));
    const outputFile = path.join(dir, 'report.json');
    spawnSync('npx', ['vitest', 'run', ...SUITE_ARGS, '--reporter=json', `--outputFile=${outputFile}`], { cwd, encoding: 'utf8' });
    const report = JSON.parse(readFileSync(outputFile, 'utf8'));
    rmSync(dir, { recursive: true, force: true });
    const tests = report.testResults.flatMap((file) => file.assertionResults);
    const skipped = tests.filter((t) => t.status === 'skipped' || t.status === 'pending');
    expect(skipped.map((t) => t.fullName)).toEqual([
      'TanStack Form 1.33.5: the installed version is the tested minimum of the peer range, which accepts its minor only (~)',
    ]);
    expect(report.numFailedTests).toBe(0);
    expect(report.numPassedTests).toBeGreaterThan(100);
  }, 180_000);
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
    expect(yml).toMatch(/^permissions:\s*\n\s+contents: read\s*$/m);
    expect(yml).not.toMatch(/:\s*write/);
  });

  it('runs the script of this repo, which stays on 1.x', () => {
    expect(yml).toContain('node scripts/tanstack-compat.mjs');
  });

  it('does not touch the job names of the required CI', () => {
    const ci = read('.github/workflows/ci.yml');
    for (const name of ['lint', 'typecheck', 'build']) expect(ci).toContain(`name: ${name}`);
    expect(yml).not.toMatch(/^ {2}(lint|typecheck|build|test|e2e|visual):/m);
  });
});
