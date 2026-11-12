// Internal fixture of e2e/docs-source.spec.ts (ticket #403), not documentation: a Docs page whose story is
// tagged `example` but is written with an inline `render` instead of `exampleStory(...)`, so its "Show code"
// is Storybook's synthesized source, not the example file verbatim. The guard must reject this page.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { InlineRenderExample } from './DocsAuditInlineRender.example';

const meta: Meta = { title: 'Internal/DocsAuditInlineRender', tags: ['autodocs', 'internal', '!visual'], component: InlineRenderExample };
export default meta;

/** Tagged `example`, but not built with `exampleStory`. */
export const Example: StoryObj = {
  tags: ['example', '!visual'],
  render: () => <InlineRenderExample />,
};
