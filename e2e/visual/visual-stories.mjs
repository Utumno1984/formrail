// Which entries of Storybook's index.json are photographed by the visual gate. Shared by
// `visual.spec.ts` (generates one test per entry) and `scripts/visual-orphans.mjs` (finds baselines
// no entry produces any more), so the two cannot diverge.

/**
 * @param {{ id: string, type?: string, tags?: string[] }} entry
 * @returns {boolean}
 */
export function isVisualEntry(entry) {
  // Autodocs entries inherit the `visual` tag of their stories, but are not photographed: a Docs page opts in
  // explicitly with `visual-docs` (the Introduction).
  return Boolean(entry.type === 'docs' ? entry.tags?.includes('visual-docs') : entry.tags?.includes('visual'));
}

/**
 * @param {Record<string, { id: string, type?: string, tags?: string[] }>} entries
 */
export function visualEntries(entries) {
  return Object.values(entries).filter(isVisualEntry);
}

/**
 * Baselines produced by tests that are not stories: the public pages photographed by `landing.spec.ts`
 * (`<name>.png`). Not orphans. `scripts/visual-orphans.test.mjs` checks the list against that spec.
 */
export const PAGE_BASELINE_IDS = ['landing', 'teams', 'privacy'];
