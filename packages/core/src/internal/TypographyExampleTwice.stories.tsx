import type { Meta, StoryObj } from '@storybook/react-vite';
import { InvoiceHeading } from '../typography/Typography.example';

// Fixture for e2e/foundations-examples.spec.ts: the copy-paste Typography example mounted twice on one page,
// to prove its label/field ids do not collide.
const meta: Meta = { title: 'Internal/TypographyExampleTwice', tags: ['internal', '!autodocs', '!visual'] };

export default meta;

export const Twice: StoryObj = {
  render: () => (
    <div>
      <InvoiceHeading />
      <InvoiceHeading />
    </div>
  ),
};
