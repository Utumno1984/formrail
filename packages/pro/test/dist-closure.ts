// Files of a built entry (ticket #489): the entry file plus every file it reaches through relative module
// specifiers (`from './chunk-x.js'`, `require('./chunk-x.cjs')`, `import('./x.js')`), JS or declaration files.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const RELATIVE = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\1/g;

/** In a declaration file `./x.js` names `./x.d.ts` (and `./x.cjs` names `./x.d.cts`), as TypeScript resolves it. */
function target(from: string, specifier: string): string {
  const path = resolve(dirname(from), specifier);
  if (!/\.d\.c?ts$/.test(from)) return path;
  return path.replace(/\.js$/, '.d.ts').replace(/\.cjs$/, '.d.cts');
}

/** The entry and every file it reaches; throws on a relative specifier that names no file. */
export function distClosure(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`${file}: not found`);
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(RELATIVE)) queue.push(target(file, match[2]!));
  }
  return [...seen].sort();
}

/** The files of the closure of `entry` whose text names `@formrail/core`. */
export const filesNamingCore = (entry: string): string[] =>
  distClosure(entry).filter((file) => readFileSync(file, 'utf8').includes('@formrail/core'));
