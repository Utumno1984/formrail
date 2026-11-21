// Internal fixture of e2e/docs-use-cases.spec.ts (ticket #624), not documentation: a Docs page with the
// neutral part first (copy-paste example, Playground, a state story) and then two domain examples
// (`use-case` stories, two verticals), which the page template shows last under "Examples".
// Hidden by `internal` (#296).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button/Button';
import { exampleStory } from './example-story';
// Aliased: the name starts with "use" but it is not a hook (react-hooks/rules-of-hooks would read it as one).
import { useCaseStory as describeUseCase } from './story-example';

const meta = {
  title: 'Internal/DocsUseCases',
  component: Button,
  tags: ['internal', '!visual'],
  argTypes: { variant: { control: 'radio', options: ['primary', 'secondary', 'ghost', 'danger'] }, children: { control: 'text' } },
  args: { variant: 'secondary', children: 'Save' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Copy-paste example on a generic record. */
export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('DocsUseCases.example.tsx') };

/** Controls of the neutral component. */
export const Playground: Story = { tags: ['playground'], args: { variant: 'primary', children: 'Save record' } };

/** A state of the neutral component. */
export const Disabled: Story = { args: { disabled: true, children: 'Save record' } };

// The description of a use case comes from useCaseStory (it would replace a JSDoc here, so there is none).
export const UseCaseErpPurchaseOrder: Story = {
  name: 'Example: configured for an ERP purchase order',
  tags: ['use-case', 'vertical:erp'],
  args: { variant: 'primary', children: 'Approve purchase order' },
  ...describeUseCase({ vertical: 'erp', problem: 'A buyer approves an order before it is sent to the supplier.', configuration: 'The label names the record.' }),
};

export const UseCaseEcommerceCart: Story = {
  name: 'Example: configured for an e-commerce cart',
  tags: ['use-case', 'vertical:e-commerce'],
  args: { variant: 'secondary', children: 'Add to cart' },
  ...describeUseCase({ vertical: 'e-commerce', problem: 'A shopper keeps a product for later.', configuration: 'Only the label changes.' }),
};
