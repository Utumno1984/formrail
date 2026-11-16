// Weekly compatibility run of the TanStack Form binding (ticket #563, decision B of Daniele, 16/11/2026): installs
// the requested `@tanstack/react-form` WITHOUT saving it (package.json and the lockfile stay as they are) and runs
// the suite of the binding against it. The adapter reads non-public internals, so this is what tells us when a new
// 1.x minor breaks it, before anybody widens the peer range `~1.33.5`.
//
// Usage: node scripts/tanstack-compat.mjs [spec]      (default spec: ^1 = the newest 1.x, never a 2.x)
// The same script runs in .github/workflows/tanstack-compat.yml and on a developer machine, so the proof that it
// fails on an incompatible version and passes on 1.33.5 is reproducible locally. A run changes node_modules:
// restore it with `npm ci`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_SPEC = '^1';

/** The spec to install: a version or range inside 1.x. `latest`, `next`, `2`, `>=1`, `*` are refused: stay on 1.x. */
export function resolveSpec(input) {
  const spec = (input ?? '').trim() || DEFAULT_SPEC;
  if (!/^[~^]?1(\.\d+){0,2}(-[\w.]+)?$/.test(spec)) {
    throw new Error(`"${spec}" is not a version or range inside 1.x (use 1.33.5, ~1.33.5, ^1 ...): the run never leaves 1.x`);
  }
  return spec;
}

/**
 * The suite: every test file with `tanstack-form` in its path (the binding tests, the internals test, the boundary
 * and built-bundle tests), minus the one assertion that is about the installed VERSION and not about behaviour
 * ("the installed version is the tested minimum of the peer range"): it fails by design on any other version.
 */
export const SUITE_ARGS = ['tanstack-form', '-t', '^(?!.*the installed version)'];

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  return spawnSync(command, args, { stdio: 'inherit', ...options });
}

function main() {
  const spec = resolveSpec(process.argv[2]);
  const root = fileURLToPath(new URL('..', import.meta.url));
  const install = run(
    'npm',
    ['install', '--no-save', '--no-audit', '--no-fund', '--workspace', 'packages/pro', `@tanstack/react-form@${spec}`],
    { cwd: root },
  );
  if (install.status !== 0) {
    console.error(`tanstack-compat: could not install @tanstack/react-form@${spec}`);
    return install.status ?? 1;
  }
  const require = createRequire(new URL('../packages/pro/package.json', import.meta.url));
  const installed = JSON.parse(readFileSync(require.resolve('@tanstack/react-form/package.json'), 'utf8')).version;
  if (!/^1\./.test(installed)) {
    console.error(`tanstack-compat: installed ${installed}, outside 1.x`);
    return 1;
  }
  console.log(`tanstack-compat: testing the binding against @tanstack/react-form ${installed} (spec ${spec})`);
  const tests = run('npx', ['vitest', 'run', ...SUITE_ARGS], { cwd: new URL('../packages/pro/', import.meta.url) });
  console.log(`tanstack-compat: @tanstack/react-form ${installed}: ${tests.status === 0 ? 'PASS' : 'FAIL'}`);
  return tests.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main());
