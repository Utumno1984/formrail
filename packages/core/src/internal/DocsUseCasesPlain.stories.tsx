// Internal fixture of e2e/docs-use-cases.spec.ts (ticket #624), not documentation: a Docs page WITHOUT a
// copy-paste example (so Storybook's own template) with two neutral stories and then two domain examples
// (`use-case` stories, two verticals), which the template shows last under "Examples". Its twin,
// DocsUseCasesPlainNeutral.stories.tsx, is the same page without the use cases: the e2e checks that the
// neutral part of the two pages is the same (keep the two files' neutral stories identical).
// Hidden by `internal` (#296).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button/Button';
// Aliased: the name starts with "use" but it is not a hook (react-hooks/rules-of-hooks would read it as one).
import { useCaseStory as describeUseCase } from './story-example';

const meta = {
  title: 'Internal/DocsUseCasesPlain',
  component: Button,
  tags: ['internal', '!visual'],
  argTypes: { variant: { control: 'radio', options: ['primary', 'secondary', 'ghost', 'danger'] }, children: { control: 'text' } },
  // A subtitle, so the e2e can tell that a template keeps it (#646).
  parameters: { componentSubtitle: 'A neutral subtitle.' },
  args: { variant: 'secondary', children: 'Save' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The neutral component on a generic record. */
export const Default: Story = { args: { children: 'Save record' } };

/** A state of the neutral component. */
export const Disabled: Story = { args: { disabled: true, children: 'Save record' } };

// The description of a use case comes from useCaseStory (it would replace a JSDoc here, so there is none).
export const UseCaseHrLeaveRequest: Story = {
  name: 'Example: configured for an HR leave request',
  tags: ['use-case', 'vertical:hr'],
  args: { variant: 'primary', children: 'Approve leave request' },
  ...describeUseCase({ vertical: 'hr', problem: 'A manager approves the days off an employee asked for.', configuration: 'The label names the request.' }),
};

export const UseCaseHelpdeskTicket: Story = {
  name: 'Example: configured for a helpdesk ticket',
  tags: ['use-case', 'vertical:helpdesk'],
  args: { variant: 'secondary', children: 'Close ticket' },
  ...describeUseCase({ vertical: 'helpdesk', problem: 'An agent closes a support ticket once it is answered.', configuration: 'Only the label changes.' }),
};
