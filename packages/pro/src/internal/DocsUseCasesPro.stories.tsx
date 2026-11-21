// Internal fixture of e2e/docs-use-cases.spec.ts (ticket #624), not documentation: a Pro Docs page without a
// copy-paste example (Storybook's own template, extended) whose neutral story comes first and whose three
// `use-case` stories, on three verticals, each carry the problem and the configuration. The page template
// shows them last under "Use cases". Hidden by `internal` (#296).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@formrail/core';
// Aliased: the name starts with "use" but it is not a hook (react-hooks/rules-of-hooks would read it as one).
import { useCaseStory as describeUseCase } from '../../../core/src/internal/story-example';

const meta = {
  title: 'Pro/Internal/DocsUseCases',
  component: Button,
  tags: ['internal', '!visual'],
  args: { variant: 'secondary', children: 'Save' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The neutral component. */
export const Playground: Story = { args: { variant: 'primary', children: 'Save record' } };

/** Use case one. */
export const UseCaseErpPurchaseOrder: Story = {
  name: 'Example: configured for an ERP purchase order',
  tags: ['use-case', 'vertical:erp'],
  args: { children: 'Approve purchase order' },
  ...describeUseCase({ vertical: 'erp', problem: 'Two operators edit the same order.', configuration: 'The label names the record.' }),
};

/** Use case two. */
export const UseCaseB2bPriceList: Story = {
  name: 'Example: configured for a B2B price list',
  tags: ['use-case', 'vertical:b2b'],
  args: { children: 'Publish price list' },
  ...describeUseCase({ vertical: 'b2b', problem: 'Two account managers edit the same price list.', configuration: 'Only the label changes.' }),
};

/** Use case three. */
export const UseCaseElearningCourse: Story = {
  name: 'Example: configured for an e-learning course',
  tags: ['use-case', 'vertical:e-learning'],
  args: { children: 'Enrol learner' },
  ...describeUseCase({ vertical: 'e-learning', problem: 'A tutor enrols a learner in a course.', configuration: 'Only the label changes.' }),
};
