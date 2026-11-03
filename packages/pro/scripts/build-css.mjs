// Builds styles.css (compiled Tailwind v4, no preflight, no token declarations) into `dist/` or
// into the directory given as first argument (used by the determinism test).
// Deterministic: same inputs -> same bytes. Needs @react-object-page/core built (theme.css).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ? resolve(process.argv[2]) : join(pkgDir, 'dist');
mkdirSync(outDir, { recursive: true });

const local = join(pkgDir, 'node_modules/.bin/tailwindcss');
const hoisted = resolve(pkgDir, '../../node_modules/.bin/tailwindcss');
const bin = existsSync(local) ? local : hoisted;

execFileSync(bin, ['-i', join(pkgDir, 'src/styles/index.css'), '-o', join(outDir, 'styles.css')], {
  cwd: pkgDir,
  stdio: 'inherit',
});
