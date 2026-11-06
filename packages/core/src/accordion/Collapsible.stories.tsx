import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Input } from '../input/Input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './Collapsible';

interface DemoArgs {
  defaultOpen: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
}

const meta = {
  title: 'Navigation/Collapsible',
  component: Collapsible,
  parameters: { layout: 'padded' },
  argTypes: {
    defaultOpen: { control: 'boolean' },
    disabled: { control: 'boolean' },
    onOpenChange: { control: false },
  },
  args: { defaultOpen: false, disabled: false, onOpenChange: fn() },
  render: ({ defaultOpen, disabled, onOpenChange }) => (
    <div style={{ maxWidth: 520, color: 'var(--color-rop-text)' }}>
      <Collapsible key={String(defaultOpen)} defaultOpen={defaultOpen} disabled={disabled} onOpenChange={onOpenChange}>
        <CollapsibleTrigger>Advanced options</CollapsibleTrigger>
        <CollapsibleContent>
          <Input aria-label="Reference" placeholder="Reference" />
        </CollapsibleContent>
      </Collapsible>
    </div>
  ),
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: initially open, disabled. The play function opens the panel with the keyboard (the
 * Actions panel logs `onOpenChange`), checks `aria-expanded` and the visible field, then closes it
 * and checks that the field is gone.
 */
export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    const trigger = canvas.getByRole('button', { name: 'Advanced options' });
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(await canvas.findByRole('textbox', { name: 'Reference' })).toBeVisible();
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard(' ');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(canvas.queryByRole('textbox', { name: 'Reference' })).toBeNull());
  },
};

function ClosedFromOutsideDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ maxWidth: 520, color: 'var(--color-rop-text)' }}>
      <button type="button" onClick={() => setOpen(false)}>
        Close from outside
      </button>
      <Collapsible open={open}>
        <CollapsibleTrigger>Advanced options</CollapsibleTrigger>
        <CollapsibleContent>
          <Input aria-label="Reference" placeholder="Reference" />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** Controlled from outside: the button closes the panel while the focus is inside it. */
export const ClosedFromOutside: Story = {
  render: () => <ClosedFromOutsideDemo />,
};

/** Visual: closed. */
export const Closed: Story = { tags: ['visual'] };

/** Visual: open. */
export const Open: Story = { tags: ['visual'], args: { defaultOpen: true } };
