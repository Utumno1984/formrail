// Internal fixture of e2e/docs-use-cases.spec.ts (ticket #624), not documentation: a Docs page WITHOUT a
// copy-paste example whose only neutral story is followed by one use case (one is enough on a Free page, and a
// Free use case may carry no description). Storybook's template renders a one-story file as a single-story page
// (the story's description under the page's, no "Stories" list): the use case must not turn it into a list. Its
// twin, DocsUseCasesSingleNeutral.stories.tsx, is the same page without the use case.
// Hidden by `internal` (#296).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button/Button';

const meta = {
  title: 'Internal/DocsUseCasesSingle',
  component: Button,
  tags: ['internal', '!visual'],
  argTypes: { variant: { control: 'radio', options: ['primary', 'secondary', 'ghost', 'danger'] }, children: { control: 'text' } },
  args: { variant: 'secondary', children: 'Save' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The only neutral story: on a single-story page this sentence sits under the page's description. */
export const Default: Story = { args: { children: 'Save record' } };

export const UseCaseB2bPriceList: Story = {
  name: 'Example: configured for a B2B price list',
  tags: ['use-case', 'vertical:b2b'],
  args: { variant: 'primary', children: 'Publish price list' },
};
