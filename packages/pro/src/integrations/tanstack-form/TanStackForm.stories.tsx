import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { exampleStory } from '../../../../core/src/internal/example-story';
import { storyControls } from '../../../../core/src/internal/story-docs';
import { TanStackFormDemo, type DemoArgs } from './tanstack-form-demo';

/**
 * `useTanStackFormBinding(form)` from `@formrail/pro/tanstack-form` binds a TanStack Form `useForm()` to the engines of
 * `@formrail/pro/engine`: `useChangeSummary` against the saved baseline, `useFormRebase` for the server updates that
 * come while the user edits. No `@formrail/core` needed: the demo uses `form.Field` with plain inputs.
 */
const meta: Meta<DemoArgs> = {
  title: 'Pro/Integrations/TanStack Form',
  parameters: { layout: 'padded' },
  // A hook page (`useTanStackFormBinding`): every control is a knob of the demo.
  argTypes: storyControls({
    saveDelay: {
      control: { type: 'range', min: 0, max: 5000, step: 250 },
      description: 'Duration of the simulated save (ms). A server update pressed while saving is queued until the save settles.',
    },
    hydrationDelay: {
      control: { type: 'range', min: 0, max: 5000, step: 250 },
      description:
        'Simulated loading time of the record (ms): the form mounts empty and the loaded record becomes the `defaultValues` of `useForm` (TanStack Form takes them on a form not touched). `0`: mounted already hydrated.',
    },
    onSave: { control: false, description: 'Called with the values sent by "Save".' },
    onServerUpdate: { control: false, description: 'Called with the incoming version when "Simulate server update" is pressed.' },
  }),
  args: {
    saveDelay: 1000,
    hydrationDelay: 0,
    onSave: fn(),
    onServerUpdate: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('TanStackForm.example.tsx') };

/**
 * A TanStack Form invoice, with the Change Summary and the rebase of `@formrail/pro/engine`. Edit "Amount" and
 * "Notes", bring "Notes" back, then press "Simulate server update" (the server changes "Supplier" and "Amount"):
 * "Supplier", untouched, takes the server value; "Amount", edited, keeps yours and is listed as a conflict. "Save"
 * waits `saveDelay` ms: a server update pressed meanwhile is queued and merged against what was saved.
 * `hydrationDelay` mounts the form empty and hydrates it later through the `defaultValues` of `useForm`: no change is
 * ever shown. The `defaultValues` then follow the binding's baseline (after a save and after a rebase), so TanStack
 * Form's own `isDefaultValue` and `form.reset()` agree with the summary.
 */
export const Playground: Story = {
  tags: ['playground', '!visual'],
  render: (args) => <TanStackFormDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const field = (name: string) => canvas.getByRole('textbox', { name });
    const summaryItems = () => canvas.queryByRole('list', { name: 'Changes' })?.querySelectorAll('li') ?? [];
    const conflictItems = () => within(canvas.getByRole('list', { name: /Conflicts/ })).queryAllByRole('listitem');

    // 1. Hydrated (after `hydrationDelay`): nothing to save.
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('All saved'), { timeout: args.hydrationDelay + 3000 });
    await expect(canvas.getByText('No changes')).toBeInTheDocument();
    await expect(field('Supplier')).toHaveValue('Lumen Parts');

    // 2. Two fields edited: two rows.
    await userEvent.clear(field('Amount'));
    await userEvent.type(field('Amount'), '120');
    await userEvent.type(field('Notes'), 'Checked by me');
    await waitFor(() => expect(summaryItems()).toHaveLength(2));
    await expect(canvas.getByRole('status')).toHaveTextContent('Unsaved changes');

    // 3. Notes back to the saved value: one row.
    await userEvent.clear(field('Notes'));
    await waitFor(() => expect(summaryItems()).toHaveLength(1));
    await expect(summaryItems()[0]).toHaveTextContent('Amount: "100" → "120"');

    // 4. The server changes Supplier and Amount.
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));
    await waitFor(() => expect(field('Supplier')).toHaveValue('Lumen Parts (updated)'));
    await expect(field('Amount')).toHaveValue('120');
    await expect(conflictItems()).toHaveLength(1);
    await expect(conflictItems()[0]).toHaveTextContent('Amount: yours "120", server "150"');
    await expect(args.onServerUpdate).toHaveBeenCalledTimes(1);
    await expect(args.onServerUpdate).toHaveBeenCalledWith({ supplier: 'Lumen Parts (updated)', amount: '150', notes: '' });

    // 5. Keep my value: the conflict closes, the edit stays.
    await userEvent.click(canvas.getByRole('button', { name: 'Keep my value for Amount' }));
    await waitFor(() => expect(conflictItems()).toHaveLength(0));
    await expect(field('Amount')).toHaveValue('120');
    await expect(canvas.getByRole('status')).toHaveTextContent('Unsaved changes');
    await expect(summaryItems()).toHaveLength(1);
    await expect(summaryItems()[0]).toHaveTextContent('Amount: "150" → "120"');
  },
};
