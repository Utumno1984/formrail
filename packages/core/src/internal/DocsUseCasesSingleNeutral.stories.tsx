// Internal fixture of e2e/docs-use-cases.spec.ts (ticket #624), not documentation: the twin of
// DocsUseCasesSingle.stories.tsx WITHOUT its use case, a single-story page rendered by Storybook's own template
// untouched. Hidden by `internal` (#296).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button/Button';

const meta = {
  title: 'Internal/DocsUseCasesSingleNeutral',
  component: Button,
  tags: ['internal', '!visual'],
  argTypes: { variant: { control: 'radio', options: ['primary', 'secondary', 'ghost', 'danger'] }, children: { control: 'text' } },
  // A subtitle, so the e2e can tell that a template keeps it (#646).
  parameters: { componentSubtitle: 'A neutral subtitle.' },
  args: { variant: 'secondary', children: 'Save' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The only neutral story: on a single-story page this sentence sits under the page's description. */
export const Default: Story = { args: { children: 'Save record' } };
