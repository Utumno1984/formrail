import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { useForm } from '@tanstack/react-form';
import { exampleStory } from '../../../../core/src/internal/example-story';
import { storyControls } from '../../../../core/src/internal/story-docs';
import { useChangeSummary, useFormRebase } from '../../engine';
import { useTanStackFormBinding } from './use-tanstack-form-binding';

interface DemoArgs {
  /** Duration of the simulated save, in milliseconds. */
  saveDelay: number;
  /** Delay before the record arrives, in milliseconds (`0`: the form mounts already hydrated). */
  hydrationDelay: number;
  /** Wired to Actions: called with the values sent by "Save". */
  onSave: (values: unknown) => void;
  /** Wired to Actions: called with the incoming version when "Simulate server update" is pressed. */
  onServerUpdate: (incoming: unknown) => void;
}

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

interface Invoice {
  supplier: string;
  amount: string;
  notes: string;
}

const RECORD: Invoice = { supplier: 'Lumen Parts', amount: '100', notes: '' };
/** The empty form shown while the record loads: one default per field. */
const EMPTY: Invoice = { supplier: '', amount: '', notes: '' };

const FIELDS: { name: keyof Invoice; label: string }[] = [
  { name: 'supplier', label: 'Supplier' },
  { name: 'amount', label: 'Amount' },
  { name: 'notes', label: 'Notes' },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function TanStackFormDemo({ saveDelay, hydrationDelay, onSave, onServerUpdate }: DemoArgs) {
  // The record as stored by the simulated server: a save writes it when the request starts.
  const server = useRef<Invoice>(RECORD);
  // The loaded record, `null` while it loads: the `defaultValues` of `useForm` follow it.
  const [record, setRecord] = useState<Invoice | null>(hydrationDelay > 0 ? null : RECORD);
  const form = useForm({
    defaultValues: record ?? EMPTY,
    onSubmit: async ({ value }) => {
      server.current = value;
      await wait(saveDelay);
      onSave(value);
      // The stored record becomes the baseline inside `onSubmit`: a rebase queued meanwhile merges against it.
      binding.reset(value);
    },
  });
  const binding = useTanStackFormBinding(form);
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { rebase, conflicts, acceptTheirs, keepMine, isPending } = useFormRebase(binding);
  const loading = record === null;

  // Asynchronous hydration: the record arrives after the mount, as the new `defaultValues` of `useForm`.
  useEffect(() => {
    if (hydrationDelay <= 0) return undefined;
    const timer = setTimeout(() => setRecord(server.current), hydrationDelay);
    return () => clearTimeout(timer);
  }, [hydrationDelay]);

  // Another user changes two fields of the stored record.
  const simulateServerUpdate = () => {
    const incoming: Invoice = {
      ...server.current,
      supplier: `${server.current.supplier} (updated)`,
      amount: String(Number(server.current.amount) + 50),
    };
    server.current = incoming;
    onServerUpdate(incoming);
    rebase(incoming);
  };

  const status = loading ? 'Loading…' : isEmpty ? 'All saved' : 'Unsaved changes';

  return (
    // Inline styles: the pro stylesheet emits no utilities (only `.rop-pro-*` component classes).
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}
    >
      {FIELDS.map(({ name, label }) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {label}
              <input name={name} value={field.state.value} disabled={loading} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
            </label>
          )}
        </form.Field>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" disabled={loading || isEmpty || binding.isSaving}>
          {binding.isSaving ? 'Saving…' : 'Save'}
        </button>
        {/* The discard against the saved baseline: TanStack Form's own `form.reset()` goes back to `defaultValues`. */}
        <button type="button" disabled={loading} onClick={() => binding.reset()}>
          Discard
        </button>
        <button type="button" disabled={loading} onClick={simulateServerUpdate}>
          Simulate server update
        </button>
      </div>
      <p role="status" style={{ margin: 0 }}>
        {[status, isPending ? 'Server update queued until the save ends' : ''].filter(Boolean).join(' · ')}
      </p>
      <section aria-labelledby="tsf-summary">
        <h3 id="tsf-summary" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Summary
        </h3>
        {isEmpty ? (
          <p style={{ margin: 0 }}>No changes</p>
        ) : (
          <ul aria-label="Changes" style={{ margin: 0, paddingLeft: 16 }}>
            {entries.map((entry) => (
              <li key={entry.path}>{`${entry.label}: ${JSON.stringify(entry.before)} → ${JSON.stringify(entry.after)}`}</li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="tsf-conflicts">
        <h3 id="tsf-conflicts" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Conflicts ({conflicts.length})
        </h3>
        <ul aria-labelledby="tsf-conflicts" style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, paddingLeft: 16 }}>
          {conflicts.map((conflict) => (
            <li key={conflict.path} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span>{`${conflict.label}: yours ${JSON.stringify(conflict.mine)}, server ${JSON.stringify(conflict.theirs)}`}</span>
              <button type="button" onClick={() => acceptTheirs(conflict.path)}>{`Accept server value for ${conflict.label}`}</button>
              <button type="button" onClick={() => keepMine(conflict.path)}>{`Keep my value for ${conflict.label}`}</button>
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}

/**
 * A TanStack Form invoice, with the Change Summary and the rebase of `@formrail/pro/engine`. Edit "Amount" and
 * "Notes", bring "Notes" back, then press "Simulate server update" (the server changes "Supplier" and "Amount"):
 * "Supplier", untouched, takes the server value; "Amount", edited, keeps yours and is listed as a conflict. "Save"
 * waits `saveDelay` ms: a server update pressed meanwhile is queued and merged against what was saved.
 * `hydrationDelay` mounts the form empty and hydrates it later through the `defaultValues` of `useForm`: no change is
 * ever shown.
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
