// Story-only (ticket #624). The rules that keep the Docs pages in the shape the maintainer asked for: the neutral
// component first, then the domain examples (`use-case` stories) in their own section. Pure functions over the
// stories of `index.json` (and, for the Pro description rule, over the stories' loaded descriptions), so they
// are unit-tested with fixtures that violate each rule; e2e/docs-use-cases.spec.ts runs them on the real index.
import { GITHUB_SLUGGER_REMOVED } from './github-slugger-regex';
import { USE_CASE_NAME_PREFIX, USE_CASE_TAG, VERTICAL_IDS, VERTICAL_TAG_PREFIX, isProTitle, isSingleNeutralStory, parseUseCaseDescription, verticalTags } from './story-example';

/** What the guard reads of a story entry of `index.json`. */
export interface IndexedStory {
  id: string;
  title: string;
  name: string;
  tags?: string[];
}

/** A Pro page of a component or engine has at least this many distinct verticals among its use cases. */
export const PRO_MIN_USE_CASE_VERTICALS = 3;

/**
 * The Pro pages that do not have them yet (ratchet): each ticket that writes a page's use cases removes its
 * entry (#531, #629, #630, #631). The guard fails on an entry whose page is already in order, and on one that
 * matches no page.
 */
export const PRO_USE_CASES_PENDING: readonly string[] = [
  'Pro/ChangeSummary',
  'Pro/Patterns/Form rebase',
  'Pro/RebaseNotice',
  'Pro/Floorplans/Virtual List Report',
  'Pro/Integrations/React Hook Form',
  'Pro/Integrations/TanStack Form',
];

const isInternal = (story: IndexedStory) => !!story.tags?.includes('internal');
const isUseCase = (story: IndexedStory) => !!story.tags?.includes(USE_CASE_TAG);

/**
 * The id Storybook gives a heading: github-slugger's `slug()` (the version bundled in Storybook 10.6.3, in
 * `@storybook/addon-docs/dist/blocks.js`; it is not a direct dependency, so it is replicated here). It lower-cases,
 * REMOVES every character in the regex copied in github-slugger-regex.ts (punctuation and symbols, no replacement:
 * `Example's` is `examples`; letters, marks, digits, `_`, `-` and space stay), then turns EACH space into a dash (no collapsing, no
 * trimming: `Use  Cases` is `use--cases`, `examples ` is `examples-`). The unit test compares the copy with the regex
 * bundled in the installed Storybook, so an upgrade that changes it fails there.
 */
export const slugOf = (text: string) => text.toLowerCase().replace(GITHUB_SLUGGER_REMOVED, '').replace(/ /g, '-');

/** The stories of each page (title), in index order: the index lists the files of one title one after the other. */
function byPage(stories: readonly IndexedStory[]): Map<string, IndexedStory[]> {
  const pages = new Map<string, IndexedStory[]>();
  for (const story of stories) pages.set(story.title, [...(pages.get(story.title) ?? []), story]);
  return pages;
}

/**
 * The stories the reader sees on a page: the public ones, or every one on a page made only of fixtures.
 * Out of scope on purpose: an `internal` variant tagged `use-case` and placed first as `autodocs` would become the
 * template's primary (which looks at every story), yet it is not seen here. The `internal` variants are not public
 * content, so the guard does not read them.
 */
function visibleStories(page: readonly IndexedStory[]): IndexedStory[] {
  const pub = page.filter((story) => !isInternal(story));
  return pub.length > 0 ? pub : [...page];
}

/** Distinct verticals among the visible use cases of a page. */
function distinctVerticals(page: readonly IndexedStory[]): Set<string> {
  return new Set(visibleStories(page).filter(isUseCase).flatMap((story) => verticalTags(story.tags)));
}

/**
 * Structure rules, one message per violation, each naming the story (or the page). `descriptions` maps a story
 * id to its `parameters.docs.description.story`, needed for the Pro rule only (a missing key is read as empty).
 */
export function auditUseCaseStructure(stories: readonly IndexedStory[], descriptions: Record<string, string | undefined> = {}): string[] {
  const problems: string[] = [];
  const label = (story: IndexedStory) => `${story.title} / ${story.name} (${story.id})`;

  for (const story of stories) {
    const verticals = verticalTags(story.tags);
    if (isUseCase(story)) {
      if (!story.name.startsWith(USE_CASE_NAME_PREFIX)) problems.push(`${label(story)}: a "${USE_CASE_TAG}" story is named "${USE_CASE_NAME_PREFIX}configured for ..."`);
      if (verticals.length !== 1) problems.push(`${label(story)}: a "${USE_CASE_TAG}" story has exactly one "${VERTICAL_TAG_PREFIX}<id>" tag (found ${verticals.length})`);
      for (const tag of verticals) {
        const id = tag.slice(VERTICAL_TAG_PREFIX.length);
        if (!VERTICAL_IDS.includes(id)) problems.push(`${label(story)}: unknown vertical "${id}" (allowed: ${VERTICAL_IDS.join(', ')})`);
      }
      if (isProTitle(story.title)) {
        const { problem, configuration } = parseUseCaseDescription(descriptions[story.id]);
        if (!problem) problems.push(`${label(story)}: a Pro use case describes the "**Problem.**" it solves`);
        if (!configuration) problems.push(`${label(story)}: a Pro use case describes its "**Configuration.**"`);
      }
    } else if (!isInternal(story) && story.name.startsWith(USE_CASE_NAME_PREFIX)) {
      problems.push(`${label(story)}: a public story named "${USE_CASE_NAME_PREFIX}..." must be tagged "${USE_CASE_TAG}"`);
    }
  }

  for (const [title, page] of byPage(stories)) {
    const visible = visibleStories(page);
    // The page opens on the neutral component: at least one story that is not a use case comes before them, so
    // the primary story (the first one) is never a domain example.
    // The template's primary is the first `autodocs` story (selectPageStories): that is the "first" here too, so a
    // page whose neutral stories are all `!autodocs` and then has a use case is caught. A page with no `autodocs`
    // story has no Docs page: its first visible story stands in.
    const documented = visible.filter((story) => !!story.tags?.includes('autodocs'));
    const first = (documented.length > 0 ? documented : visible)[0];
    if (first && isUseCase(first)) {
      problems.push(`${label(first)}: no neutral story before the first use case; a page shows the neutral component first (a story that is not "${USE_CASE_TAG}")`);
    }
    let seen: IndexedStory | undefined;
    for (const story of visible) {
      if (isUseCase(story)) seen ??= story;
      else if (seen) problems.push(`${label(story)}: comes after the use case "${seen.name}" (${seen.id}); the "${USE_CASE_TAG}" stories go last on the page`);
    }
    // The section's heading takes the id `examples` (Free) or `use-cases` (Pro), and Storybook gives a story's own
    // heading the slug of its name: a neutral story with that name would repeat the id on the page.
    const sectionId = isProTitle(title) ? 'use-cases' : 'examples';
    // A page of one neutral story renders no heading for it (isSingleNeutralStory, over the whole CSF file), so the name cannot collide.
    const singleNeutralStory = isSingleNeutralStory(page);
    if (!singleNeutralStory && visible.some(isUseCase)) {
      for (const story of visible.filter((s) => !isUseCase(s) && slugOf(s.name) === sectionId)) {
        problems.push(`${label(story)}: a page with use cases cannot have a story named "${story.name}": its heading id "${sectionId}" is the one of the use-cases section`);
      }
    }
    const count = visible.filter(isUseCase).length;
    const needed = Math.min(count, PRO_MIN_USE_CASE_VERTICALS);
    const have = distinctVerticals(page).size;
    if (have < needed) problems.push(`${title}: ${count} use cases but only ${have} distinct verticals (at least ${needed} needed)`);
  }
  return problems;
}

/** Pro pages of a component or engine: with public stories, not a showcase. (The Pro introduction is MDX, not a story.) */
function proComponentPages(stories: readonly IndexedStory[]): Map<string, IndexedStory[]> {
  const pages = byPage(stories);
  for (const [title, page] of [...pages]) {
    if (!isProTitle(title) || title.startsWith('Pro/Showcase/') || page.every(isInternal)) pages.delete(title);
  }
  return pages;
}

/**
 * The Pro ratchet: every Pro component page has {@link PRO_MIN_USE_CASE_VERTICALS} verticals, except the ones
 * in `pending`. Does nothing on an index without Pro pages (the Free build).
 */
export function auditProRatchet(stories: readonly IndexedStory[], pending: readonly string[] = PRO_USE_CASES_PENDING): string[] {
  const pages = proComponentPages(stories);
  if (pages.size === 0) return [];
  const problems: string[] = [];
  for (const [title, page] of pages) {
    const have = distinctVerticals(page).size;
    const ok = have >= PRO_MIN_USE_CASE_VERTICALS;
    const listed = pending.includes(title);
    if (!ok && !listed) problems.push(`${title}: a Pro page needs "Use cases" on at least ${PRO_MIN_USE_CASE_VERTICALS} verticals (has ${have}, ${PRO_MIN_USE_CASE_VERTICALS - have} missing)`);
    if (ok && listed) problems.push(`${title}: already has ${have} verticals, remove it from PRO_USE_CASES_PENDING`);
  }
  for (const title of pending) {
    if (!pages.has(title)) problems.push(`PRO_USE_CASES_PENDING lists "${title}", which is not a Pro page of this build (remove or fix the entry)`);
  }
  return problems;
}
