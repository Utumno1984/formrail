// tsup's CJS pass (with `splitting: true`) writes the absolute path of the build machine into
// `file` and into the first entry of `sources` of every `*.cjs.map`. Make them (and `sourceRoot`,
// when present) relative to the map's own directory so nothing machine-specific ends up in the
// published package. Indices in `sources` are untouched, so the mappings stay valid. Walks `dist/`
// recursively in case a future build layout nests chunks in subdirectories. Idempotent.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = process.argv[2] ? resolve(process.argv[2]) : join(pkgDir, 'dist');

for (const name of readdirSync(distDir, { recursive: true })) {
  if (!name.endsWith('.map')) continue;
  const path = join(distDir, name);
  const mapDir = dirname(path);
  const map = JSON.parse(readFileSync(path, 'utf8'));
  let changed = false;
  if (typeof map.file === 'string' && isAbsolute(map.file)) {
    map.file = relative(mapDir, map.file);
    changed = true;
  }
  if (typeof map.sourceRoot === 'string' && isAbsolute(map.sourceRoot)) {
    map.sourceRoot = relative(mapDir, map.sourceRoot);
    changed = true;
  }
  if (Array.isArray(map.sources)) {
    map.sources = map.sources.map((source) => {
      if (typeof source !== 'string' || !isAbsolute(source)) return source;
      changed = true;
      return relative(mapDir, source);
    });
  }
  if (changed) writeFileSync(path, JSON.stringify(map));
}
