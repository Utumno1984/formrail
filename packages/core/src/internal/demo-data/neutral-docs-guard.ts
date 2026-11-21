// Story-only (ticket #625). The guard that keeps the neutral part of every public Docs page free of business
// domains: the rule agreed on 21/11/2026 is that a domain appears only in a story that declares itself an
// example (`use-case`, #624). Pure functions over the index of the build and over the text the e2e reads from
// each rendered story; `e2e/docs-neutral.spec.ts` runs them on the real build, with the ratchet in
// `scripts/neutral-docs.baseline.json`. Lives in `demo-data/` because it reads `DOMAIN_TERMS`.
import { USE_CASE_TAG, selectPageStories } from '../story-example';
import { DOMAIN_TERMS } from './records';

/** What the guard reads of a story entry of `index.json`. */
export interface NeutralIndexStory {
  id: string;
  title: string;
  tags?: string[];
}

/** A domain term found in the text of a rendered story. */
export interface DomainFinding {
  /** The term of `DOMAIN_TERMS`, lower case (so `SKUs` is reported as `sku`). */
  term: string;
  /** A few words around the match, as written. */
  excerpt: string;
}

/** Titles that are not component pages: the reference applications and the introductions. */
const EXCLUDED_TITLES: readonly RegExp[] = [/^Showcase(\/|$)/, /^Pro\/Showcase(\/|$)/, /^Introduction$/, /^Pro introduction$/, /^Pro\/Introduction$/];

/** What separates the words of a compound term: spaces, hyphens (ASCII, U+2010, U+2011, en dash) and underscores. */
const SEPARATOR = '[\\s\\-‐‑–_]+';

/**
 * One matcher per term. `findDomainTerm` (#622) looks for whole words and does not see plurals, which would let
 * "Invoices" through: here a term may be followed by a plural `s` or `es` (`invoices`, `SKUs`, `support cases`,
 * `checkouts`), and still only as a whole word, so "Productivity", "Discourse" and "myinvoice" do not match. The
 * words of a compound term are joined by {@link SEPARATOR}: `purchase-order` and `sales_order` count.
 */
const MATCHERS: readonly { term: string; pattern: RegExp }[] = DOMAIN_TERMS.map((term) => ({
  term: term.toLowerCase(),
  pattern: new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/ /g, SEPARATOR)}(?:e?s)?(?![\\p{L}\\p{N}])`, 'giu'),
}));

/**
 * The closed list of everyday phrases in which a term is not the business word: only `course`, and only these
 * three. Nothing else is allowed: `stock` stays forbidden even in "in stock" or "stock photo" (commercial
 * language), and "courses" is always the domain. Adding a phrase is a change to this list and to its test.
 */
export const ALLOWED_PHRASES: Readonly<Record<string, readonly RegExp[]>> = {
  course: [
    /(?<![\p{L}\p{N}])of\s+course(?![\p{L}\p{N}])/giu,
    /(?<![\p{L}\p{N}])in\s+the\s+course\s+of(?![\p{L}\p{N}])/giu,
    /(?<![\p{L}\p{N}])over\s+the\s+course\s+of(?![\p{L}\p{N}])/giu,
  ],
};

const EXCERPT_RADIUS = 30;

/** The first match of `term` that is not inside an allowed phrase, or `undefined`. */
function firstMatch(text: string, term: string, pattern: RegExp): RegExpExecArray | undefined {
  const allowed: [number, number][] = [];
  for (const phrase of ALLOWED_PHRASES[term] ?? []) {
    for (const m of text.matchAll(phrase)) allowed.push([m.index, m.index + m[0].length]);
  }
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const end = match.index + match[0].length;
    if (!allowed.some(([from, to]) => from <= match.index && end <= to)) return match;
  }
  return undefined;
}

/** Every distinct domain term in `text` (one finding per term, the first match), in `DOMAIN_TERMS` order. */
export function findDomainTerms(text: string): DomainFinding[] {
  const findings: DomainFinding[] = [];
  for (const { term, pattern } of MATCHERS) {
    const match = firstMatch(text, term, pattern);
    if (!match) continue;
    const from = Math.max(0, match.index - EXCERPT_RADIUS);
    const to = Math.min(text.length, match.index + match[0].length + EXCERPT_RADIUS);
    findings.push({ term, excerpt: text.slice(from, to).replace(/\s+/g, ' ').trim() });
  }
  return findings;
}

/**
 * The stories whose rendered text the guard reads, by page title: the neutral stories of each public Docs page
 * (the ones the page shows before its use cases: copy-paste example, Playground, "Stories"). Not read: the
 * `use-case` stories, the `internal` ones, the pages in {@link EXCLUDED_TITLES}, a title with no Docs page.
 */
export function neutralDocsStories(stories: readonly NeutralIndexStory[], docsTitles: ReadonlySet<string>): Map<string, NeutralIndexStory[]> {
  const pages = new Map<string, NeutralIndexStory[]>();
  for (const story of stories) {
    if (!docsTitles.has(story.title) || EXCLUDED_TITLES.some((re) => re.test(story.title))) continue;
    if (story.tags?.includes('internal') || story.tags?.includes(USE_CASE_TAG)) continue;
    pages.set(story.title, [...(pages.get(story.title) ?? []), story]);
  }
  for (const [title, page] of [...pages]) {
    const { primary, others } = selectPageStories(page);
    pages.set(title, primary ? [primary, ...others] : others);
  }
  return pages;
}

/** The ratchet file: for each page that still holds domain terms, the terms (lower case). It can only shrink. */
export interface NeutralDocsBaseline {
  version: 1;
  pages: Record<string, string[]>;
}

export interface NeutralFinding extends DomainFinding {
  title: string;
  storyId: string;
}

export const BASELINE_FILE = 'scripts/neutral-docs.baseline.json';

/**
 * Violations, one message each. `scanned` is every page that was read (a page with no finding is in it), so a
 * baseline entry for a page that does not exist is told apart from one for a page that is clean.
 */
export function auditNeutralDocs(scanned: readonly string[], findings: readonly NeutralFinding[], baseline: NeutralDocsBaseline): string[] {
  const problems: string[] = [];
  for (const finding of findings) {
    const listed = baseline.pages[finding.title];
    if (listed?.includes(finding.term)) continue;
    problems.push(
      `${finding.storyId} (${finding.title}): the domain term "${finding.term}" in the neutral text: "${finding.excerpt}". ` +
        `Use a generic word, or move the domain into a "${USE_CASE_TAG}" story (CONTRIBUTING.md, "Demo data"); the baseline ${BASELINE_FILE} cannot take new pages or terms`,
    );
  }
  for (const [title, listed] of Object.entries(baseline.pages)) {
    if (!scanned.includes(title)) {
      problems.push(`${BASELINE_FILE} lists "${title}", which is not a public Docs page of this build: remove it from the baseline`);
      continue;
    }
    const found = new Set(findings.filter((finding) => finding.title === title).map((finding) => finding.term));
    if (found.size === 0) {
      problems.push(`${title}: no domain term left in the neutral text, remove it from the baseline (${BASELINE_FILE})`);
      continue;
    }
    for (const term of listed) {
      if (!found.has(term)) problems.push(`${title}: "${term}" is no longer in the neutral text, remove it from the baseline entry (${BASELINE_FILE})`);
    }
  }
  return problems;
}
