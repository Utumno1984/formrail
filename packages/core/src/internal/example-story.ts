/// <reference types="vite/client" />
// Story-only (tickets #403, #447). Kept apart from story-example.ts because it imports a module that only
// Storybook's Vite build provides, and story-example.ts is also read by Node (the e2e guard).
import { createElement } from 'react';
// The example files of THIS build (core and Pro in the complete build, core only in the Free build, the public
// Pro folders only in the Pro demo): see .storybook/example-sources-plugin.mjs. The component AND the text come
// from the same file, so the "Show code" of a page cannot print another file's code or code that is not the
// component rendered above it.
import sources from 'virtual:formrail/example-sources';
import { createExampleLookup } from './example-lookup';
import { EXAMPLE_RENDER_MARK } from './story-example';

const lookup = createExampleLookup(sources);

/**
 * The story of a copy-paste example, from the example file's NAME (`'DirtyGuard.example.tsx'`, next to the
 * stories, same base name as the stories file), in packages/core/src or packages/pro/src: renders the file's
 * component (its only exported function) and prints the file's text verbatim as "Show code". `type: 'code'`:
 * the text as written, never a JSX synthesized from the rendered tree. Spread it into the story and write the
 * tags next to it: `export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('X.example.tsx') }`.
 * The e2e guard checks that the printed text is the file `<stories file>.example.tsx` on disk.
 */
export function exampleStory(file: string, props: object = {}) {
  const { component: Example, code } = lookup(file);
  // Marked, so the audit can tell this render from one written (or assigned) over it.
  const render = Object.assign(() => createElement(Example, props), { [EXAMPLE_RENDER_MARK]: true });
  return {
    parameters: { docs: { source: { code, language: 'tsx', type: 'code' as const } } },
    render,
  };
}
