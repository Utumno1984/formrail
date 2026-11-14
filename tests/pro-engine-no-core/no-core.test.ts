// Ticket #489: a project with react, react-dom, react-hook-form and @formrail/pro, WITHOUT @formrail/core,
// typechecks (`tsc --noEmit`, `skipLibCheck: false`) and runs (ESM and CJS) against @formrail/pro/engine.
//
// The monorepo cannot serve as that project: its node_modules holds the core (a workspace), and any module
// resolution walks up to it. So the test builds a sandbox in the OS temp directory: `consumer/`, the BUILT
// @formrail/pro (package.json + dist, as `npm pack` ships it: run `npm run build` first) and links to the
// other packages, and checks that no @formrail/core is reachable from it. Negative controls: the main entry
// `@formrail/pro`, which names the core, fails to typecheck and to load in the same sandbox.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PRO = resolve(ROOT, 'packages/pro');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');

/** Installed in the sandbox by a link to the monorepo copy (realpath: one React for every package). */
const LINKED = ['react', 'react-dom', 'scheduler', 'react-hook-form', '@types/react', '@types/react-dom', 'csstype'];

let sandbox: string;

const run = (args: string[]) =>
  spawnSync(process.execPath, args, { cwd: sandbox, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });

/** Every directory from `dir` up to the filesystem root. */
function ancestors(dir: string): string[] {
  const out = [dir];
  while (dirname(out.at(-1)!) !== out.at(-1)) out.push(dirname(out.at(-1)!));
  return out;
}

beforeAll(() => {
  if (!existsSync(join(PRO, 'dist/engine.js'))) throw new Error('packages/pro/dist not found: run `npm run build` first.');
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'formrail-no-core-')));
  cpSync(join(HERE, 'consumer'), sandbox, { recursive: true });
  const pro = join(sandbox, 'node_modules/@formrail/pro');
  mkdirSync(pro, { recursive: true });
  cpSync(join(PRO, 'package.json'), join(pro, 'package.json'));
  cpSync(join(PRO, 'dist'), join(pro, 'dist'), { recursive: true });
  for (const name of LINKED) {
    const target = join(ROOT, 'node_modules', name);
    if (!existsSync(target)) throw new Error(`${name} is not installed in the monorepo`);
    mkdirSync(dirname(join(sandbox, 'node_modules', name)), { recursive: true });
    symlinkSync(target, join(sandbox, 'node_modules', name), 'dir');
  }
});

afterAll(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

describe('@formrail/pro/engine in a project without @formrail/core', () => {
  it('no @formrail/core is reachable from the sandbox', () => {
    for (const dir of ancestors(sandbox)) expect(existsSync(join(dir, 'node_modules/@formrail/core'))).toBe(false);
    expect(run(['-e', "require.resolve('@formrail/core')"]).status).not.toBe(0);
  });

  it('tsc --noEmit passes on a React Hook Form consumer of the engine entry', () => {
    const result = spawnSync(process.execPath, [TSC, '--noEmit', '-p', 'tsconfig.json'], { cwd: sandbox, encoding: 'utf8' });
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('negative control: the main entry @formrail/pro fails to typecheck there (it names the core)', () => {
    const result = spawnSync(process.execPath, [TSC, '--noEmit', '-p', 'negative/tsconfig.json'], { cwd: sandbox, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/Cannot find module '@formrail\/core(\/internal)?'/);
  });

  it('ESM: imports the engine, renders a React Hook Form summary on the server and merges', () => {
    const out = JSON.parse(execFileSync(process.execPath, ['run.mjs'], { cwd: sandbox, encoding: 'utf8' })) as {
      html: string;
      conflicts: string[];
      values: Record<string, unknown>;
    };
    expect(out.html).toBe('<ul><li>Amount</li><li>Notes</li></ul>');
    expect(out.conflicts).toEqual(['amount']);
    expect(out.values).toEqual({ number: 'A-2', amount: 15, notes: 'call back' });
  });

  it('CJS: requires the engine', () => {
    expect(JSON.parse(execFileSync(process.execPath, ['run.cjs'], { cwd: sandbox, encoding: 'utf8' }))).toEqual({ paths: ['name'], hook: 'function' });
  });

  it('negative control: loading the main entry @formrail/pro fails there, on the missing core', () => {
    const result = run(['--input-type=module', '-e', "await import('@formrail/pro')"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Cannot find (package|module) '@formrail\/core/);
  });
});
