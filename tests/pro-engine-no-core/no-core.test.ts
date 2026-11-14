// Ticket #489: a project with react, react-dom, react-hook-form and @formrail/pro, WITHOUT @formrail/core,
// typechecks (`tsc --noEmit`, `skipLibCheck: false`) and runs (ESM and CJS) against @formrail/pro/engine.
//
// The monorepo cannot serve as that project: its node_modules holds the core (a workspace), and any module
// resolution walks up to it. So the test builds a sandbox in the OS temp directory: `consumer/`, the BUILT
// @formrail/pro (package.json + dist, as `npm pack` ships it: run `npm run build` first) and links to the
// other packages, and checks that no @formrail/core is reachable from it. Negative controls: the main entry
// `@formrail/pro`, which names the core, fails to typecheck and to load in the same sandbox. A second suite
// installs the packed package with npm and checks that the optional core peer is left out.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

// What the README says about the main entry without the core under `skipLibCheck: true` (the default of the Vite
// and Next.js templates): `tsc` passes, core types turn into `any` (a wrong argument passes too), and the error
// comes when the module loads, explicitly. If any of this changes, the README and the study must change with it.
describe('main entry without @formrail/core, skipLibCheck: true (documented behaviour)', () => {
  it('tsc passes, even with a wrong argument to a core-typed API', () => {
    const result = spawnSync(process.execPath, [TSC, '--noEmit', '-p', 'skiplibcheck/tsconfig.json'], { cwd: sandbox, encoding: 'utf8' });
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('ESM: loading fails with ERR_MODULE_NOT_FOUND on @formrail/core', () => {
    const result = run(['--input-type=module', '-e', "await import('@formrail/pro')"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND');
    expect(result.stderr).toContain("Cannot find package '@formrail/core'");
  });

  it('CJS: loading fails with Cannot find module @formrail/core', () => {
    const result = run(['-e', "require('@formrail/pro')"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Cannot find module '@formrail/core'");
  });
});

// Smoke test 1 of the ticket: `npm install` of the packed @formrail/pro in a project that does not ask for the
// core leaves the core out, because it is an optional peer (`peerDependenciesMeta`). Offline, from local
// tarballs only (react, react-dom and scheduler packed from the monorepo copies): no registry access.
describe('npm install of the packed @formrail/pro (optional core peer)', () => {
  let project: string;
  const npm = (args: string[], cwd = project) =>
    spawnSync('npm', [...args, '--offline', '--no-audit', '--no-fund', '--ignore-scripts', '--loglevel=error'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, npm_config_workspaces: '', NODE_OPTIONS: '' },
    });

  /** `npm pack` of `dir` into `project`; returns the tarball name. */
  const pack = (dir: string): string => {
    const result = npm(['pack', dir, '--pack-destination', project, '--json']);
    if (result.status !== 0) throw new Error(`npm pack ${dir}: ${result.stderr}`);
    return (JSON.parse(result.stdout) as { filename: string }[])[0]!.filename;
  };

  /** A project depending on the packed pro (with `proPackage` as its package.json) plus react and react-dom. */
  function install(proPackage: (pkg: Record<string, unknown>) => Record<string, unknown>) {
    const proCopy = join(project, 'pro');
    mkdirSync(proCopy, { recursive: true });
    cpSync(join(PRO, 'dist'), join(proCopy, 'dist'), { recursive: true });
    const pkg = JSON.parse(readFileSync(join(PRO, 'package.json'), 'utf8')) as Record<string, unknown>;
    writeFileSync(join(proCopy, 'package.json'), JSON.stringify(proPackage(pkg), null, 2));
    const dependencies: Record<string, string> = { '@formrail/pro': `file:./${pack(proCopy)}` };
    for (const name of ['react', 'react-dom', 'scheduler']) dependencies[name] = `file:./${pack(join(ROOT, 'node_modules', name))}`;
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'only-pro', private: true, dependencies }, null, 2));
    return npm(['install']);
  }

  beforeEach(() => {
    project = realpathSync(mkdtempSync(join(tmpdir(), 'formrail-only-pro-')));
  });
  afterEach(() => rmSync(project, { recursive: true, force: true }));

  it('the core is not installed: `npm ls @formrail/core` reports it absent, the engine entry loads', () => {
    const result = install((pkg) => pkg);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(existsSync(join(project, 'node_modules/@formrail/pro/dist/engine.js'))).toBe(true);
    expect(existsSync(join(project, 'node_modules/@formrail/core'))).toBe(false);
    const ls = npm(['ls', '@formrail/core']);
    expect(ls.stdout).toContain('(empty)');
    expect(ls.stdout).not.toContain('@formrail/core@');
    const load = spawnSync(process.execPath, ['--input-type=module', '-e', "const e = await import('@formrail/pro/engine'); console.log(typeof e.useFormRebase)"], {
      cwd: project,
      encoding: 'utf8',
    });
    expect(load.stdout.trim()).toBe('function');
  });

  it('negative control: without peerDependenciesMeta, npm wants the core (installs it or fails offline)', () => {
    const result = install((pkg) => {
      const copy = { ...pkg };
      delete copy.peerDependenciesMeta;
      return copy;
    });
    const coreAbsent = result.status === 0 && !existsSync(join(project, 'node_modules/@formrail/core'));
    expect(coreAbsent).toBe(false);
  });
});
