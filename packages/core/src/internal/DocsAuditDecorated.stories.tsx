// Internal fixture of e2e/docs-source.spec.ts (ticket #403), not documentation: a Docs page whose example
// story is intact (its own `render`, its file printed verbatim) but is wrapped by decorators and loaders, on the
// story and on the page's meta: what a reader sees is not what the code says. The audit must reject this page.
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { exampleStory } from './example-story';
import { DecoratedExample } from './DocsAuditDecorated.example';

const meta: Meta = {
  title: 'Internal/DocsAuditDecorated',
  tags: ['autodocs', 'internal', '!visual'],
  component: DecoratedExample,
  decorators: [(Story) => <section data-meta-decorator><Story /></section>],
  loaders: [async () => ({})],
};
export default meta;

/** Prints the example file, wrapped by decorators and loaders of its own and of the meta. */
export const Example: StoryObj = Object.assign({ tags: ['example', '!visual'] }, exampleStory('DocsAuditDecorated.example.tsx'), {
  component: DecoratedExample,
  decorators: [(Story: () => ReactElement) => <div data-story-decorator><Story /></div>],
  loaders: [async () => ({})],
});
