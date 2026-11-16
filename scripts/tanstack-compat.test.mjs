import { readFileSync } from 'node:fs';
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
  it('runs the files of the TanStack binding and leaves out only the assertion on the installed version', () => {
    expect(SUITE_ARGS).toEqual(['tanstack-form', '-t', '^(?!.*the installed version is the tested minimum of the peer range)']);
    const excluded = new RegExp(SUITE_ARGS[2]);
    const internals = read('packages/pro/src/integrations/tanstack-form/tanstack-form-internals.test.tsx');
    // The excluded test exists with exactly that name, and a behaviour test is not caught by the exclusion.
    expect(internals).toContain("describe('TanStack Form 1.33.5: the installed version'");
    const fullName =
      'TanStack Form 1.33.5: the installed version is the tested minimum of the peer range, which accepts its minor only (~)';
    expect(internals).toContain("it('is the tested minimum of the peer range, which accepts its minor only (~)'");
    expect(excluded.test(fullName)).toBe(false);
    // Another test that merely mentions "the installed version" is not skipped by mistake.
    expect(excluded.test('x: the installed version is read from package.json')).toBe(true);
    expect(excluded.test('1. update(): useForm re-applies its options at every render')).toBe(true);
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
