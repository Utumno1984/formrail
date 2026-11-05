import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The package-contract and consumer tests exercise the built `dist`. In `npm run check` the
 * build step has already run (lint -> types -> build -> unit), so this is a no-op there; on a
 * fresh clone, a bare `npm test` builds once instead of failing on a missing `dist`.
 */
export default function setup(): void {
  const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const entries = ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts', 'internal.js', 'internal.cjs', 'internal.d.ts', 'internal.d.cts'];
  if (entries.every((entry) => existsSync(join(packageDir, 'dist', entry)))) return;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['run', 'build'], { cwd: packageDir, stdio: 'inherit' });
}
