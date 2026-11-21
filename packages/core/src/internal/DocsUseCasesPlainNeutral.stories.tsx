// Internal fixture of e2e/docs-use-cases.spec.ts (ticket #624), not documentation: the twin of
// DocsUseCasesPlain.stories.tsx WITHOUT its use cases, rendered by Storybook's own template untouched. The
// e2e checks that the neutral part of the two pages is the same (keep the two files' neutral stories identical).
// Hidden by `internal` (#296).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button/Button';

const meta = {
  title: 'Internal/DocsUseCasesPlainNeutral',
  component: Button,
  tags: ['internal', '!visual'],
  argTypes: { variant: { control: 'radio', options: ['primary', 'secondary', 'ghost', 'danger'] }, children: { control: 'text' } },
  args: { variant: 'secondary', children: 'Save' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The neutral component on a generic record. */
export const Default: Story = { args: { children: 'Save record' } };

/** A state of the neutral component. */
export const Disabled: Story = { args: { disabled: true, children: 'Save record' } };
