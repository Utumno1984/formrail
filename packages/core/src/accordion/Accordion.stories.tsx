import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Input } from '../input/Input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, type AccordionHeadingLevel } from './Accordion';

interface DemoArgs {
  type: 'single' | 'multiple';
  collapsible: boolean;
  disabled: boolean;
  headingLevel: AccordionHeadingLevel;
  /** Story-only: which item is disabled (`none` for no one). */
  disabledItem: 'none' | 'shipping' | 'billing';
  /** Story-only: items open at first. */
  open: string[];
  /** Story-only: replaces the first label with a very long one. */
  longLabel: boolean;
  onValueChange: (value: string | string[]) => void;
}

const ITEMS = [
  { value: 'details', label: 'Invoice details' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'billing', label: 'Billing' },
];

const LONG_LABEL =
  'Invoice details with a very long label that has to wrap inside the trigger instead of pushing the chevron out of the page';

function Demo({ type, collapsible, disabled, headingLevel, disabledItem, open, longLabel, onValueChange }: DemoArgs) {
  const items = ITEMS.map((item, i) => ({ ...item, label: i === 0 && longLabel ? LONG_LABEL : item.label }));
  const body = items.map((item) => (
    <AccordionItem key={item.value} value={item.value} disabled={item.value === disabledItem}>
      <AccordionTrigger>{item.label}</AccordionTrigger>
      <AccordionContent>
        <Input aria-label={`${ITEMS.find((i) => i.value === item.value)!.label} note`} placeholder="Note" />
      </AccordionContent>
    </AccordionItem>
  ));
  return (
    <div style={{ maxWidth: 520, color: 'var(--color-rop-text)' }}>
      {type === 'single' ? (
        <Accordion
          // Re-mount when the controls that decide the initial state change.
          key={`single-${open.join()}`}
          type="single"
          collapsible={collapsible}
          disabled={disabled}
          headingLevel={headingLevel}
          defaultValue={open[0] ?? ''}
          onValueChange={onValueChange}
        >
          {body}
        </Accordion>
      ) : (
        <Accordion
          key={`multiple-${open.join()}`}
          type="multiple"
          disabled={disabled}
          headingLevel={headingLevel}
          defaultValue={open}
          onValueChange={onValueChange}
        >
          {body}
        </Accordion>
      )}
    </div>
  );
}

const meta = {
  title: 'Navigation/Accordion',
  parameters: { layout: 'padded' },
  argTypes: {
    type: { control: 'radio', options: ['single', 'multiple'] },
    collapsible: { control: 'boolean', description: 'Only `type="single"`: can the open item be closed.' },
    disabled: { control: 'boolean' },
    headingLevel: { control: 'select', options: [2, 3, 4, 5, 6] },
    disabledItem: { control: 'select', options: ['none', 'shipping', 'billing'] },
    open: { control: 'check', options: ['details', 'shipping', 'billing'] },
    longLabel: { control: 'boolean' },
    onValueChange: { control: false },
  },
  args: {
    type: 'single',
    collapsible: true,
    disabled: false,
    headingLevel: 3,
    disabledItem: 'none',
    open: [],
    longLabel: false,
    onValueChange: fn(),
  },
  render: (args) => <Demo {...(args as unknown as DemoArgs)} />,
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: single / multiple, collapsible, disabled, heading level. The play function reaches the
 * first trigger with Tab, opens the second item with ArrowDown + Enter (the Actions panel logs
 * `onValueChange`), checks `aria-expanded` and that its field is visible, then opens the third and
 * checks that the second closed and that its field is no longer reachable with Tab.
 */
export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Invoice details' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    const second = canvas.getByRole('button', { name: 'Shipping' });
    await expect(second).toHaveFocus();
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(await canvas.findByRole('textbox', { name: 'Shipping note' })).toBeVisible();
    await expect(args.onValueChange).toHaveBeenLastCalledWith('shipping');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(canvas.getByRole('button', { name: 'Billing' })).toHaveAttribute('aria-expanded', 'true');
    await expect(second).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(canvas.queryByRole('textbox', { name: 'Shipping note' })).toBeNull());
    // Tab from the second trigger goes to the third trigger, not into the closed panel.
    second.focus();
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Billing' })).toHaveFocus();
  },
};

/** Visual: everything closed. */
export const Closed: Story = { tags: ['visual'] };

/** Visual: one item open. */
export const OneOpen: Story = { tags: ['visual'], args: { open: ['shipping'] } };

/** Visual: `multiple` with two items open. */
export const MultipleOpen: Story = { tags: ['visual'], args: { type: 'multiple', open: ['details', 'billing'] } };

/** Visual: a disabled item (skipped by the arrow keys). */
export const DisabledItem: Story = {
  tags: ['visual'],
  args: { open: ['details'], disabledItem: 'shipping' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('button', { name: 'Billing' })).toHaveFocus();
  },
};

/** Visual: a long label wraps inside the trigger; the chevron stays in place; no overflow at 375px. */
export const LongTrigger: Story = { tags: ['visual'], args: { longLabel: true, open: ['details'] } };

/** `collapsible` off: the open item cannot be closed by clicking it. */
export const NotCollapsible: Story = {
  args: { collapsible: false, open: ['details'] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Invoice details' }));
    await expect(canvas.getByRole('button', { name: 'Invoice details' })).toHaveAttribute('aria-expanded', 'true');
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};
