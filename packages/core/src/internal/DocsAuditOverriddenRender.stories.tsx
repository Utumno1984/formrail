// Internal fixture of e2e/docs-source.spec.ts (ticket #403), not documentation: a Docs page whose example
// story prints its example file verbatim but renders ANOTHER component (a `render` assigned over the one of
// `exampleStory` after the object is built, which lint cannot see). The audit must reject this page, naming the render.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { exampleStory } from './example-story';
import { OverriddenRenderExample } from './DocsAuditOverriddenRender.example';

const meta: Meta = { title: 'Internal/DocsAuditOverriddenRender', tags: ['autodocs', 'internal', '!visual'], component: OverriddenRenderExample };
export default meta;

/** Prints `DocsAuditOverriddenRender.example.tsx` but renders the text "Another demo". */
export const Example: StoryObj = { tags: ['example', '!visual'], ...exampleStory('DocsAuditOverriddenRender.example.tsx') };
// Assigned afterwards: the lint rule on `...exampleStory()` objects does not see it; the audit must.
Example.render = () => <p>Another demo</p>;
