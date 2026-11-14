// Checks of the map of renamed story ids, .storybook/legacy-story-ids.mjs (ticket #516). Kept out of
// that file on purpose: its source is inlined into every Storybook page, these checks are not.
//   - `legacyMapProblems`: the map alone (scripts/legacy-story-ids.test.mjs).
//   - `legacyIndexProblems`: the map against built `index.json` files (e2e/legacy-story-ids.spec.ts on the
//     complete build, e2e/site/legacy-story-ids.spec.ts on the Free and Pro deploy builds).

// A Storybook id as `toId` builds it: two slugs of [a-z0-9] words joined by single dashes, separated by `--`.
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const STORY_ID = new RegExp(`^${SLUG}--${SLUG}$`);
const isDocs = (id) => id.endsWith('--docs');

/**
 * What is wrong with the map itself, as readable messages (empty: nothing). An old id must be a well-formed
 * id, point at a well-formed id other than itself, Docs to Docs and story to story, and never at another old
 * id: a chain (`a -> b -> c`) would redirect twice (the manager, then its preview frame) and a cycle
 * (`a -> b -> a`) forever, so both are rejected; fold a chain into single hops instead.
 *
 * @param {Record<string, unknown>} map
 * @returns {string[]}
 */
export function legacyMapProblems(map) {
  if (map === null || typeof map !== 'object' || Array.isArray(map)) return ['the map is not a plain object'];
  const problems = [];
  const has = (id) => Object.prototype.hasOwnProperty.call(map, id);
  for (const [from, to] of Object.entries(map)) {
    if (!STORY_ID.test(from)) {
      problems.push(`"${from}" is not a story id (lowercase slugs joined by "--")`);
      continue;
    }
    if (typeof to !== 'string' || !STORY_ID.test(to)) {
      problems.push(`"${from}" -> ${JSON.stringify(to)}: the target is not a story id`);
      continue;
    }
    if (to === from) {
      problems.push(`"${from}" -> "${to}": points at itself (a cycle)`);
      continue;
    }
    if (isDocs(from) !== isDocs(to)) problems.push(`"${from}" -> "${to}": a Docs id must map to a Docs id, a story id to a story id`);
    if (has(to)) {
      // Follow the hops: back to a visited id = a cycle, otherwise a chain.
      const seen = [from];
      let id = to;
      while (has(id) && !seen.includes(id)) {
        seen.push(id);
        id = map[id];
      }
      problems.push(
        seen.includes(id)
          ? `"${from}" -> "${to}": a cycle (${[...seen, id].join(' -> ')})`
          : `"${from}" -> "${to}": a chain (${[...seen, id].join(' -> ')}), "${to}" is itself an old id: point "${from}" at "${id}"`,
      );
    }
  }
  return problems;
}

/**
 * What is wrong with the map against built Storybook indexes (the `entries` of their `index.json`). An old
 * id present in ANY index is still a real story or Docs page that the redirect would hide; a new id must be
 * present in at least one (the Free build or the Pro one: a Pro id is not expected in the Free build).
 *
 * @param {Record<string, string>} map
 * @param {Array<{ name: string, entries: Record<string, unknown> }>} indexes
 * @param {{ targets?: boolean }} [options] `targets: false` checks the old ids only
 * @returns {string[]}
 */
export function legacyIndexProblems(map, indexes, { targets = true } = {}) {
  if (indexes.length === 0) throw new Error('legacyIndexProblems: no index to check against');
  for (const { name, entries } of indexes) {
    if (!entries || Object.keys(entries).length === 0) throw new Error(`legacyIndexProblems: the index of ${name} has no entry`);
  }
  const problems = [];
  const where = (id) => indexes.filter(({ entries }) => Object.prototype.hasOwnProperty.call(entries, id)).map(({ name }) => name);
  for (const [from, to] of Object.entries(map)) {
    const shadowed = where(from);
    if (shadowed.length > 0) problems.push(`old id "${from}" still exists in ${shadowed.join(', ')}: the redirect would hide it`);
    if (targets && where(to).length === 0) {
      problems.push(`new id "${to}" (for "${from}") exists in none of ${indexes.map(({ name }) => name).join(', ')}`);
    }
  }
  return problems;
}
