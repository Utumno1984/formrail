// Guard on the visual baselines (#517): fails when a PNG in e2e/visual/__screenshots__/<project>/ has no
// story (tag `visual`) or Docs page (tag `visual-docs`) with the same id in Storybook's index.json.
// Renaming a story makes `--update-snapshots` write the new PNG and leave the old one: a dead file that
// looks like coverage.
//
//   node scripts/visual-orphans.mjs [--index <index.json>]... [--dir <screenshots dir>]
//
// Baselines of the site pages (landing.spec.ts) are not stories and are known explicitly (PAGE_BASELINE_IDS).
// The default index is storybook-static/index.json, the COMPLETE build (Free + Pro stories): it is the one
// `visual.spec.ts` photographs. A story left out of that build must be passed with another `--index` (the
// ids of all the given indexes are merged). A missing or unreadable index is an error, never "no orphans".
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_BASELINE_IDS, visualEntries } from '../e2e/visual/visual-stories.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INDEX = resolve(ROOT, 'storybook-static/index.json');
const DEFAULT_DIR = resolve(ROOT, 'e2e/visual/__screenshots__');

/**
 * Pure comparison.
 * @param {string[]} ids ids of the photographed entries
 * @param {Record<string, string[]>} files file names per viewport folder (e.g. `visual-desktop`)
 * @returns {{ orphans: string[], missing: Record<string, string[]> }} orphans as `<folder>/<file>.png`;
 *   missing = ids with no baseline in a folder (informational: the visual run itself fails on those)
 */
export function compareBaselines(ids, files) {
  const known = new Set(ids);
  const orphans = [];
  const missing = {};
  for (const [folder, names] of Object.entries(files)) {
    const pngs = names.filter((n) => n.endsWith('.png'));
    const have = new Set(pngs.map((n) => n.slice(0, -4)));
    for (const n of pngs.slice().sort()) if (!known.has(n.slice(0, -4))) orphans.push(`${folder}/${n}`);
    const gone = [...known].filter((id) => !have.has(id)).sort();
    if (gone.length) missing[folder] = gone;
  }
  return { orphans, missing };
}

/** Ids photographed by one index.json file. Throws if it cannot be read. */
export function readVisualIds(indexPath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (e) {
    throw new Error(
      `visual-orphans: cannot read ${indexPath} (${String(e)}). Build Storybook first (npm run build-storybook).`,
    );
  }
  const ids = visualEntries(parsed.entries ?? {}).map((e) => e.id);
  if (ids.length === 0) throw new Error(`visual-orphans: no entry tagged "visual" in ${indexPath}`);
  return ids;
}

/** File names per `visual-*` folder of the screenshots directory. */
export function readBaselines(dir) {
  if (!existsSync(dir)) throw new Error(`visual-orphans: baselines folder not found: ${dir}`);
  const files = {};
  for (const folder of readdirSync(dir).sort()) {
    const path = resolve(dir, folder);
    if (folder.startsWith('visual-') && statSync(path).isDirectory()) files[folder] = readdirSync(path);
  }
  return files;
}

export function formatReport(orphans, dir = DEFAULT_DIR) {
  const shown = relative(ROOT, dir) || dir;
  return [
    `visual-orphans: ${orphans.length} baseline PNG(s) without a "visual" story or "visual-docs" page:`,
    ...orphans.map((o) => `  ${o}`),
    '',
    'The story was renamed or removed (or lost its tag). Delete the old files:',
    `  git rm ${orphans.map((o) => `${shown}/${o}`).join(' ')}`,
  ].join('\n');
}

export function run(argv) {
  const indexes = [];
  let dir = DEFAULT_DIR;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--index') indexes.push(resolve(argv[++i] ?? ''));
    else if (argv[i] === '--dir') dir = resolve(argv[++i] ?? '');
    else throw new Error(`visual-orphans: unknown argument ${argv[i]}`);
  }
  const ids = [...new Set([...(indexes.length ? indexes : [DEFAULT_INDEX]).flatMap(readVisualIds), ...PAGE_BASELINE_IDS])];
  const { orphans } = compareBaselines(ids, readBaselines(dir));
  if (orphans.length) return { ok: false, message: formatReport(orphans, dir) };
  return { ok: true, message: `visual-orphans: no orphan baselines (${ids.length} photographed entries)` };
}

if (process.argv[1] && basename(process.argv[1]) === 'visual-orphans.mjs') {
  try {
    const { ok, message } = run(process.argv.slice(2));
    (ok ? console.log : console.error)(message);
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
}
