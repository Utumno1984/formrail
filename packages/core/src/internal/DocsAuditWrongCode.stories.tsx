// Internal fixture of e2e/docs-source.spec.ts (ticket #403), not documentation: a Docs page whose example
// story prints the text of ANOTHER example file (the scenario of a copy-pasted `?raw` import pointing at the
// wrong file). The guard must reject this page. Hidden from the public sidebar by `internal` (#296).
import type { Meta, StoryObj } from '@storybook/react-vite';
import otherExampleCode from '../truncated-text/TruncatedText.example.tsx?raw';
import { exampleStory } from './example-story';
import { WrongCodeExample } from './DocsAuditWrongCode.example';

const meta: Meta = { title: 'Internal/DocsAuditWrongCode', tags: ['autodocs', 'internal', '!visual'], component: WrongCodeExample };
export default meta;

/** Renders its own component but prints another example file's code. */
export const Example: StoryObj = {
  tags: ['example', '!visual'],
  ...exampleStory('DocsAuditWrongCode.example.tsx'),
  // Over the spread's `parameters`: its render stays the example's own, only the printed text is another file's.
  parameters: { docs: { source: { code: otherExampleCode, language: 'tsx', type: 'code' } } },
};
