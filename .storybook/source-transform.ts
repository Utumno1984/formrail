// "Show code" source selection (ticket #333). Shared by .storybook/preview.ts (production) and
// e2e/docs-source.spec.ts, so the stories the e2e expects to print their original source are, by
// construction, exactly the ones the Docs pages switch: the two can no longer drift apart.

/** A function declaration whose name can be a JSX component (capitalised): `function XyzDemo(`. */
const COMPONENT_DECLARATION = /\bfunction\s+([A-Z][\w$]*)\s*\(/g;

/**
 * Whether a story's original source declares a local component AND renders it as a JSX tag:
 * `render: () => { function XyzDemo() {...} return <XyzDemo />; }`. Storybook's dynamic JSX synthesis
 * collapses exactly those into a minified placeholder such as `<t />`.
 *
 * A named render that is not itself rendered as a tag (`render: function Render(args) { ...; return
 * <div>...</div>; }`) is NOT a match: its synthesized JSX (a native element with the live args) is
 * correct and must stay. Neither is a story rendering a module-level component (`<PlaygroundDemo
 * {...args} />`), whose declaration is outside the story's source. Only `function` declarations are
 * recognised (no story uses `const Demo = () => ...` in a render today); the e2e scan of every Docs page
 * fails on any placeholder, so a new shape would not slip through silently.
 */
export function rendersLocalComponent(source: string): boolean {
  for (const [, name = ''] of source.matchAll(COMPONENT_DECLARATION)) {
    if (new RegExp(`<${name.replace(/\$/g, '\\$')}[\\s/>]`).test(source)) return true;
  }
  return false;
}

interface SourceContext {
  parameters?: { docs?: { source?: { originalSource?: unknown } } };
}

/** `parameters.docs.source.transform`: the original source for the stories above, the given code otherwise. */
export function transformSource(code: string, storyContext: SourceContext): string {
  const original = storyContext.parameters?.docs?.source?.originalSource;
  return typeof original === 'string' && rendersLocalComponent(original) ? original : code;
}
