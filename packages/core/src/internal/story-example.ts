// Story-only (not exported by the package, ticket #403): the copy-paste examples of the Docs pages and the
// readable source of the showcases. Shared by the core and Pro stories, by the Docs page template
// (.storybook/docs-page.tsx) and by the guard that checks them (e2e/docs-source.spec.ts), so the three
// agree on the same tags and the same repository URL by construction.

/**
 * Tag of the story at the top of a Docs page that renders a copy-paste example: a `*.example.tsx` file next
 * to the stories, written as a consumer writes it (only `@formrail/core` / `@formrail/pro` imports),
 * type-checked and linted with the package, and printed verbatim as "Show code". Storybook reads tags
 * statically: every example story writes `tags: [EXAMPLE_TAG literal, '!visual']` itself (no spread).
 */
export const EXAMPLE_TAG = 'example';

/**
 * Tag of the story the Docs page template shows right after the example, with the page's Controls attached
 * (Storybook 10's autodocs attaches them to the primary story, which is now the example: an example reads
 * no args, so its controls would change nothing). At most one per Docs page.
 */
export const PLAYGROUND_TAG = 'playground';

/**
 * Tag of the first story of a showcase page: a whole application, not a snippet. Its "Show code" says
 * where the code is; the page shows the main source files (`SourceFile`) with a link to GitHub.
 */
export const SHOWCASE_SOURCE_TAG = 'showcase-source';

/**
 * Set (as a property) on the `render` that `exampleStory` returns: the e2e audit reads it from the loaded story
 * to know that the component rendered above the printed code is the example's own, not a `render` written next
 * to the spread, or added by `Object.assign`, that lint cannot see (ticket #403).
 */
export const EXAMPLE_RENDER_MARK_KEY = 'formrail.exampleStory.render';
export const EXAMPLE_RENDER_MARK = Symbol.for(EXAMPLE_RENDER_MARK_KEY);

/** The repository's `main` branch on GitHub: the only place the URL is written. */
export const REPOSITORY_MAIN = 'https://github.com/Utumno1984/formrail/blob/main/';

/** The GitHub URL of a repository path (a file or a folder) on `main`. */
export function githubSource(repoPath: string): string {
  return `${REPOSITORY_MAIN}${repoPath.replace(/^\/+/, '')}`;
}

/** One source file shown on a showcase's Docs page, in a `Source` block with its GitHub link. */
export interface SourceFile {
  /** Repository path (`packages/core/src/showcase/InvoiceCrud.tsx`): the heading and the GitHub link. */
  path: string;
  /** The file's text, imported with `?raw`. */
  code: string;
  /** What the file is, and which of its imports are not public API (fixtures, story-only helpers). */
  note: string;
}

/**
 * The files a showcase lists, from ONE source: `sources` is the stories file's own
 * `import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })` and `notes` is keyed by
 * the file name. The repository path and the text shown both derive from that name, so a renamed file or a
 * path pointing at another file's text cannot happen (a name with no file throws).
 */
export function showcaseFiles(folder: string, sources: Record<string, string>, notes: Record<string, string>): SourceFile[] {
  return Object.entries(notes).map(([name, note]) => {
    const code = sources[`./${name}`];
    if (code === undefined) throw new Error(`${folder}/${name}: no such file next to the stories (the showcase lists it)`);
    return { path: `${folder}/${name}`, code, note };
  });
}

/**
 * Parameters of a showcase's first story: its "Show code" points to the sources instead of printing the
 * application's wrapper, and the page lists `files` (rendered by .storybook/docs-page.tsx).
 */
export function showcaseSource(folder: string, files: SourceFile[]) {
  const code = [
    '// This story is a whole application, not a snippet to paste.',
    '// Its main files are shown below on this page, and the complete source is on GitHub:',
    `// ${githubSource(folder)}`,
  ].join('\n');
  return { docs: { source: { code, language: 'tsx', type: 'code' as const }, sourceFiles: files } };
}

/** What the template and the guard need of a story: its id and its (static) tags. */
export interface TaggedStory {
  id: string;
  tags?: string[];
}

/**
 * The Playground of a Docs page: the one story tagged {@link PLAYGROUND_TAG}, `undefined` when there is none.
 * Throws on two: the template would not know which to attach the Controls to.
 */
export function findPlayground<T extends TaggedStory>(stories: readonly T[]): T | undefined {
  const tagged = stories.filter((story) => story.tags?.includes(PLAYGROUND_TAG));
  if (tagged.length > 1) throw new Error(`More than one story tagged "${PLAYGROUND_TAG}" on one page: ${tagged.map((s) => s.id).join(', ')}`);
  return tagged[0];
}

/**
 * The story whose Controls (and props table) a Docs page shows, given the page's stories in page order: the
 * Playground when the page opens with a copy-paste example, the primary (first) story otherwise, as in
 * Storybook's own template. The ONE rule shared by the template (.storybook/docs-page.tsx) and the guards that
 * read that table (e2e/docs-props.spec.ts).
 */
export function controlsStory<T extends TaggedStory>(stories: readonly T[]): T | undefined {
  const [primary, ...rest] = stories;
  if (!primary?.tags?.includes(EXAMPLE_TAG)) return primary;
  return findPlayground(rest) ?? primary;
}

/** What {@link selectPageStories} reads of a story. */
export interface PageStory extends TaggedStory {
  usesMount?: boolean;
}

/**
 * The stories of a Docs page, selected exactly as Storybook's own `Primary` and `Stories` blocks do (the
 * template renders those blocks' content itself, so it must not drift from them): the primary is the first
 * autodocs story (the first story when `filterByAutodocs` is `false`, as for the docs of an external
 * preview); the others are the stories left by `parameters.docs.stories.filter` (tags excluded from the Docs,
 * `parameters.docs.disable`...), then, when any of those is tagged `autodocs`, only the autodocs ones without
 * `mount` in their play function. The primary is never repeated among the others.
 */
export function selectPageStories<T extends PageStory>(
  all: readonly T[],
  options: { filter?: ((story: T) => boolean) | null; filterByAutodocs?: boolean } = {},
): { primary: T | undefined; others: T[] } {
  const autodocs = (story: T) => !!story.tags?.includes('autodocs');
  const primary = options.filterByAutodocs === false ? all[0] : all.find(autodocs);
  let others = options.filter ? all.filter(options.filter) : [...all];
  if (others.some(autodocs)) others = others.filter((story) => autodocs(story) && !story.usesMount);
  return { primary, others: others.filter((story) => story !== primary) };
}
