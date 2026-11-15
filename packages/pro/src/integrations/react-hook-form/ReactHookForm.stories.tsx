import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { useFieldArray, useForm } from 'react-hook-form';
import { exampleStory } from '../../../../core/src/internal/example-story';
import { storyControls } from '../../../../core/src/internal/story-docs';
import { useChangeSummary, useFormRebase } from '../../engine';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

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
 * `useReactHookFormBinding(form)` from `@formrail/pro/react-hook-form` binds a React Hook Form `useForm()` to the
 * engines of `@formrail/pro/engine`: `useChangeSummary` against the saved baseline, `useFormRebase` for the server
 * updates that come while the user edits. No `@formrail/core` needed: the demo uses plain inputs.
 */
const meta: Meta<DemoArgs> = {
  title: 'Pro/Integrations/React Hook Form',
  parameters: { layout: 'padded' },
  // A hook page (`useReactHookFormBinding`): every control is a knob of the demo.
  argTypes: storyControls({
    saveDelay: {
      control: { type: 'range', min: 0, max: 5000, step: 250 },
      description: 'Duration of the simulated save (ms). A server update pressed while saving is queued until the save settles.',
    },
    hydrationDelay: {
      control: { type: 'range', min: 0, max: 5000, step: 250 },
      description: 'Simulated loading time of the record (ms): the form mounts empty and `form.reset(data)` hydrates it. `0`: mounted already hydrated.',
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

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('ReactHookForm.example.tsx') };

interface Invoice {
  supplier: string;
  amount: string;
  notes: string;
}

const RECORD: Invoice = { supplier: 'Acme Corp', amount: '100', notes: '' };
/** The empty form shown while the record loads: one default per field, as React Hook Form asks. */
const EMPTY: Invoice = { supplier: '', amount: '', notes: '' };

const FIELDS: { name: keyof Invoice; label: string }[] = [
  { name: 'supplier', label: 'Supplier' },
  { name: 'amount', label: 'Amount' },
  { name: 'notes', label: 'Notes' },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ReactHookFormDemo({ saveDelay, hydrationDelay, onSave, onServerUpdate }: DemoArgs) {
  const form = useForm<Invoice>({ defaultValues: hydrationDelay > 0 ? EMPTY : RECORD });
  const binding = useReactHookFormBinding(form);
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { rebase, conflicts, acceptTheirs, keepMine, isPending } = useFormRebase(binding);
  const [loading, setLoading] = useState(hydrationDelay > 0);
  // The record as stored by the simulated server: a save writes it when the request starts.
  const server = useRef<Invoice>(RECORD);

  // Asynchronous hydration: the record arrives after the mount, through React Hook Form's own `reset`.
  useEffect(() => {
    if (hydrationDelay <= 0) return undefined;
    const timer = setTimeout(() => {
      form.reset(server.current);
      setLoading(false);
    }, hydrationDelay);
    return () => clearTimeout(timer);
  }, [form, hydrationDelay]);

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

  const save = form.handleSubmit(async (values) => {
    server.current = values;
    await wait(saveDelay);
    onSave(values);
    // The stored record becomes the baseline inside the handler: a rebase queued meanwhile merges against it.
    binding.reset(values);
  });

  const status = loading ? 'Loading…' : isEmpty ? 'All saved' : 'Unsaved changes';

  return (
    // Inline styles: the pro stylesheet emits no utilities (only `.rop-pro-*` component classes).
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
      {FIELDS.map(({ name, label }) => (
        <label key={name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {label}
          <input {...form.register(name)} disabled={loading} />
        </label>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" disabled={loading || isEmpty || form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={loading} onClick={() => form.reset()}>
          Discard
        </button>
        <button type="button" disabled={loading} onClick={simulateServerUpdate}>
          Simulate server update
        </button>
      </div>
      <p role="status" style={{ margin: 0 }}>
        {[status, isPending ? 'Server update queued until the save ends' : ''].filter(Boolean).join(' · ')}
      </p>
      <section aria-labelledby="rhf-summary">
        <h3 id="rhf-summary" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
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
      <section aria-labelledby="rhf-conflicts">
        <h3 id="rhf-conflicts" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Conflicts ({conflicts.length})
        </h3>
        <ul aria-labelledby="rhf-conflicts" style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, paddingLeft: 16 }}>
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
 * A React Hook Form invoice, with the Change Summary and the rebase of `@formrail/pro/engine`. Edit "Amount" and
 * "Notes", bring "Notes" back, then press "Simulate server update" (the server changes "Supplier" and "Amount"):
 * "Supplier", untouched, takes the server value; "Amount", edited, keeps yours and is listed as a conflict. "Save"
 * waits `saveDelay` ms: a server update pressed meanwhile is queued and merged against what was saved.
 * `hydrationDelay` mounts the form empty and hydrates it later with `form.reset(data)`: no change is ever shown.
 */
export const Playground: Story = {
  tags: ['playground', '!visual'],
  render: (args) => <ReactHookFormDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const field = (name: string) => canvas.getByRole('textbox', { name });
    const summaryItems = () => canvas.queryByRole('list', { name: 'Changes' })?.querySelectorAll('li') ?? [];
    const conflictItems = () => within(canvas.getByRole('list', { name: /Conflicts/ })).queryAllByRole('listitem');

    // 1. Hydrated (after `hydrationDelay`): nothing to save.
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('All saved'), { timeout: args.hydrationDelay + 3000 });
    await expect(canvas.getByText('No changes')).toBeInTheDocument();
    await expect(field('Supplier')).toHaveValue('Acme Corp');

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
    await waitFor(() => expect(field('Supplier')).toHaveValue('Acme Corp (updated)'));
    await expect(field('Amount')).toHaveValue('120');
    await expect(conflictItems()).toHaveLength(1);
    await expect(conflictItems()[0]).toHaveTextContent('Amount: yours "120", server "150"');
    await expect(args.onServerUpdate).toHaveBeenCalledTimes(1);
    await expect(args.onServerUpdate).toHaveBeenCalledWith({ supplier: 'Acme Corp (updated)', amount: '150', notes: '' });

    // 5. Keep my value: the conflict closes, the edit stays.
    await userEvent.click(canvas.getByRole('button', { name: 'Keep my value for Amount' }));
    await waitFor(() => expect(conflictItems()).toHaveLength(0));
    await expect(field('Amount')).toHaveValue('120');
    await expect(canvas.getByRole('status')).toHaveTextContent('Unsaved changes');
    await expect(summaryItems()).toHaveLength(1);
    await expect(summaryItems()[0]).toHaveTextContent('Amount: "150" → "120"');
  },
};

interface Order {
  supplier: string;
  lines: { id: string; description: string; qty: string }[];
}

const ORDER: Order = {
  supplier: 'Acme Corp',
  lines: [
    { id: 'L1', description: 'Cable', qty: '1' },
    { id: 'L2', description: 'Switch', qty: '2' },
  ],
};
const LINE_IDS = { lines: 'id' };
/** How long after the click the server update arrives: time to go back to typing in a row. */
const SERVER_DELAY = 1000;

function LineItemsDemo({ onServerUpdate }: DemoArgs) {
  const form = useForm<Order>({ defaultValues: ORDER });
  const { fields } = useFieldArray({ control: form.control, name: 'lines', keyName: 'key' });
  // The same id key for the binding and the engines: rows are matched by id, never by position.
  const binding = useReactHookFormBinding(form, { arrayIdKeys: LINE_IDS });
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline, arrayIdKeys: LINE_IDS });
  const { rebase, conflicts, acceptTheirs } = useFormRebase(binding, { arrayIdKeys: LINE_IDS });
  const [scheduled, setScheduled] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Another user renames the supplier and the first line, a moment later.
  const scheduleServerUpdate = () => {
    setScheduled(true);
    timer.current = setTimeout(() => {
      const { baseline } = binding;
      const incoming: Order = {
        supplier: `${baseline.supplier} (updated)`,
        lines: baseline.lines.map((line, index) => (index === 0 ? { ...line, description: `${line.description} (updated)` } : line)),
      };
      onServerUpdate(incoming);
      rebase(incoming);
      setScheduled(false);
    }, SERVER_DELAY);
  };

  return (
    <form style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }} onSubmit={(event) => event.preventDefault()}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        Supplier
        <input {...form.register('supplier')} />
      </label>
      {fields.map((field, index) => (
        <fieldset key={field.key} style={{ display: 'flex', gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 14 }}>{`Line ${index + 1}`}</legend>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {`Description ${index + 1}`}
            <input {...form.register(`lines.${index}.description`)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {`Quantity ${index + 1}`}
            <input inputMode="numeric" {...form.register(`lines.${index}.qty`)} />
          </label>
        </fieldset>
      ))}
      <div>
        <button type="button" disabled={scheduled} onClick={scheduleServerUpdate}>
          {`Server update in ${SERVER_DELAY / 1000} s`}
        </button>
      </div>
      <p role="status" style={{ margin: 0 }}>
        {[isEmpty ? 'All saved' : 'Unsaved changes', scheduled ? 'server update coming' : ''].filter(Boolean).join(' · ')}
      </p>
      {isEmpty ? (
        <p style={{ margin: 0 }}>No changes</p>
      ) : (
        <ul aria-label="Changes" style={{ margin: 0, paddingLeft: 16 }}>
          {entries.map((entry) => (
            <li key={entry.path}>{`${entry.label}: ${JSON.stringify(entry.before)} → ${JSON.stringify(entry.after)}`}</li>
          ))}
        </ul>
      )}
      <ul aria-label={`Conflicts (${conflicts.length})`} style={{ margin: 0, paddingLeft: 16 }}>
        {conflicts.map((conflict) => (
          <li key={conflict.path}>
            {`${conflict.label}: yours ${JSON.stringify(conflict.mine)}, server ${JSON.stringify(conflict.theirs)} `}
            <button type="button" onClick={() => acceptTheirs(conflict.path)}>{`Accept server value for ${conflict.label}`}</button>
          </li>
        ))}
      </ul>
    </form>
  );
}

/**
 * Rows of a `useFieldArray`, matched by id (`arrayIdKeys: { lines: 'id' }`, the same for the binding and the
 * engines). Type in a row, press "Server update in 1 s" and go back to the row: when the update arrives (the server
 * renames the supplier and the first line) the row you are typing in keeps its input, its focus and its caret. A
 * rebase never remounts the rows: the binding writes only the fields that change.
 */
export const LineItems: Story = {
  name: 'Line items',
  tags: ['!visual'],
  render: (args) => <LineItemsDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const field = (name: string) => canvas.getByRole('textbox', { name }) as HTMLInputElement;

    // 1. Edit the second line, schedule a server update, go back to typing in the same line.
    const quantity = field('Quantity 2');
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '5');
    await userEvent.click(canvas.getByRole('button', { name: 'Server update in 1 s' }));
    await userEvent.click(quantity);
    await userEvent.type(quantity, '0');

    // 2. The update arrives: supplier and first line take the server values.
    await waitFor(() => expect(field('Supplier')).toHaveValue('Acme Corp (updated)'), { timeout: SERVER_DELAY + 3000 });
    await expect(field('Description 1')).toHaveValue('Cable (updated)');
    await expect(args.onServerUpdate).toHaveBeenCalledTimes(1);

    // 3. The line being typed in is the same input, still focused, with the user's value: typing goes on there.
    await expect(field('Quantity 2')).toBe(quantity);
    await expect(quantity).toHaveFocus();
    await userEvent.keyboard('0');
    await expect(quantity).toHaveValue('500');
    await expect(canvas.getByRole('status')).toHaveTextContent('Unsaved changes');
    await waitFor(() => expect(canvas.getByRole('list', { name: 'Changes' }).querySelectorAll('li')).toHaveLength(1));
  },
};
