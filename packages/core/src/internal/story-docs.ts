// Story-only (not exported by the package, ticket #401): how a story's Controls that are NOT props of the
// documented component show up in the Docs props table. Shared by the core and Pro stories, so every page
// uses the same category name; e2e/docs-props.spec.ts reads the same name (it is part of the guard).
import type { InputType } from 'storybook/internal/csf';

/**
 * The props-table category of every story arg that is not a prop of the page's `component` (or of its
 * `subcomponents`): a demo knob (`dataset`, `containerWidth`, `fieldState`, ...) or an option of a hook
 * the demo calls (`useListReport({ searchCommitDelay })`). Storybook renders it as a separate, collapsible
 * group under the real props, so a demo knob never passes for a prop.
 */
export const STORY_CONTROLS = 'Story controls';

/**
 * Files an arg under {@link STORY_CONTROLS}. The `description` is required: it says what the knob does in
 * the demo, or which hook option it is (`useListReport({ onSortChange })`).
 */
export function storyControl<T extends InputType & { description: string }>(argType: T): T {
  return { ...argType, table: { ...argType.table, category: STORY_CONTROLS } };
}

/**
 * The row of `className` where a story exposes it: an attribute every component inherits from its root
 * element's HTML attributes (the docgen leaves those out), so the story describes it.
 */
export const CLASS_NAME_ARG = {
  control: false,
  description: "Extra classes for the root element, merged with the component's own (tailwind-merge: yours win on a conflict).",
} as const satisfies InputType;

/**
 * {@link storyControl} on every entry: the argTypes of a page that documents no component (a showcase, a
 * hook), where every arg is a demo knob or a hook option.
 */
export function storyControls<T extends Record<string, InputType & { description: string }>>(argTypes: T): T {
  return Object.fromEntries(Object.entries(argTypes).map(([name, argType]) => [name, storyControl(argType)])) as T;
}

/**
 * Props of the documented component that the demo does not take from the story args (it sets them itself,
 * or they need a value no control can build, e.g. `table`): their row stays in the props table, with its
 * TSDoc, but without a Control that would change nothing in the canvas. Spread into `argTypes` (a spread
 * is not subject to the excess-property check of `Meta<DemoArgs>`).
 */
export function withoutControls(...names: string[]): Record<string, InputType> {
  return Object.fromEntries(names.map((name) => [name, { control: false }]));
}
