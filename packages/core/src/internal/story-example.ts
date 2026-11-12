// Story-only (not exported by the package, ticket #403): the copy-paste examples of the Docs pages and the
// readable source of the showcases. Shared by the core and Pro stories, by the Docs page template
// (.storybook/docs-page.tsx) and by the guard that checks them (e2e/docs-source.spec.ts), so the three
// agree on the same tags and the same repository URL by construction.
import { createElement, type ComponentType } from 'react';

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

/** The repository's `main` branch on GitHub: the only place the URL is written. */
export const REPOSITORY_MAIN = 'https://github.com/Utumno1984/formrail/blob/main/';

/** The GitHub URL of a repository path (a file or a folder) on `main`. */
export function githubSource(repoPath: string): string {
  return `${REPOSITORY_MAIN}${repoPath.replace(/^\/+/, '')}`;
}

/**
 * The story of a copy-paste example: renders the example's component and prints the example file's text
 * (`import code from './X.example.tsx?raw'`) as "Show code". `type: 'code'`: the text as written, never a
 * JSX synthesized from the rendered tree. Spread it into the story and write the tags next to it:
 * `export const Example: Story = { tags: ['example', '!visual'], ...exampleStory(XExample, code) }`.
 */
export function exampleStory<P extends object>(Example: ComponentType<P>, code: string, ...props: object extends P ? [] : [P]) {
  // An example that takes what the app owns (a navigation callback) gets it from the story.
  const given = (props[0] ?? {}) as P;
  return {
    parameters: { docs: { source: { code, language: 'tsx', type: 'code' as const } } },
    render: () => createElement(Example, given),
  };
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
