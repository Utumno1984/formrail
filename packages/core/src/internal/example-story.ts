/// <reference types="vite/client" />
// Story-only (ticket #403). Kept apart from story-example.ts because it uses Vite's `import.meta.glob`, and
// story-example.ts is also read by Node (the e2e guard).
import { createElement, type ComponentType } from 'react';
import { EXAMPLE_RENDER_MARK } from './story-example';

// The example files, found by Vite: the component AND the text come from the same file, so the "Show code" of
// a page cannot print another file's code or code that is not the component rendered above it.
const MODULES = import.meta.glob<Record<string, unknown>>('../**/*.example.tsx', { eager: true });
const TEXTS = import.meta.glob<string>('../**/*.example.tsx', { eager: true, query: '?raw', import: 'default' });

function byFileName<T>(files: Record<string, T>, kind: string): Map<string, T> {
  const named = new Map<string, T>();
  for (const [path, value] of Object.entries(files)) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (named.has(name)) throw new Error(`Two example files named ${name}: the ${kind} lookup would be ambiguous`);
    named.set(name, value);
  }
  return named;
}

const MODULE_OF = byFileName(MODULES, 'module');
const TEXT_OF = byFileName(TEXTS, 'text');

/**
 * The story of a copy-paste example, from the example file's NAME (`'DirtyGuard.example.tsx'`, next to the
 * stories, same base name as the stories file): renders the file's component (its only exported function)
 * and prints the file's text verbatim as "Show code". `type: 'code'`: the text as written, never a JSX
 * synthesized from the rendered tree. Spread it into the story and write the tags next to it:
 * `export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('X.example.tsx') }`.
 * The e2e guard checks that the printed text is the file `<stories file>.example.tsx` on disk.
 */
export function exampleStory(file: string, props: object = {}) {
  const module = MODULE_OF.get(file);
  const code = TEXT_OF.get(file);
  if (!module || code === undefined) throw new Error(`${file}: no such example file (expected a *.example.tsx under packages/core/src)`);
  const components = Object.values(module).filter((value): value is ComponentType<object> => typeof value === 'function');
  if (components.length !== 1) throw new Error(`${file}: an example file exports exactly one component, found ${components.length}`);
  const Example = components[0]!;
  // Marked, so the audit can tell this render from one written (or assigned) over it.
  const render = Object.assign(() => createElement(Example, props), { [EXAMPLE_RENDER_MARK]: true });
  return {
    parameters: { docs: { source: { code, language: 'tsx', type: 'code' as const } } },
    render,
  };
}
