import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button, Field, Input, Text, useObjectPageForm } from '@formrail/core';
import { storyControls } from '../../../core/src/internal/story-docs';
import { computeRebase } from './compute-rebase';
import { useFormRebase } from './use-form-rebase';

interface DemoArgs {
  /** Duration of the simulated save, in milliseconds. */
  saveDelay: number;
  /** Wired to Actions: called with the values sent by "Save". */
  onSave: (values: unknown) => void;
  /** Wired to Actions: called with the incoming version when "Simulate server update" is pressed. */
  onServerUpdate: (incoming: unknown) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Pro/Patterns/Form rebase',
  parameters: { layout: 'padded' },
  // A hook page (`useFormRebase`): every control is a knob of the demo.
  argTypes: storyControls({
    saveDelay: {
      control: { type: 'range', min: 0, max: 5000, step: 250 },
      description: 'Duration of the simulated save (ms). A server update pressed while saving is queued until the save settles.',
    },
    onSave: { control: false, description: 'Called with the values sent by "Save".' },
    onServerUpdate: { control: false, description: 'Called with the incoming version when "Simulate server update" is pressed.' },
  }),
  args: {
    saveDelay: 1000,
    onSave: fn(),
    onServerUpdate: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

interface Invoice {
  number: string;
  supplier: string;
  amount: string;
  notes: string;
}

const BASELINE: Invoice = { number: 'INV-001', supplier: 'Acme Corp', amount: '100', notes: '' };

const FIELDS: { name: keyof Invoice; label: string }[] = [
  { name: 'number', label: 'Number' },
  { name: 'supplier', label: 'Supplier' },
  { name: 'amount', label: 'Amount' },
  { name: 'notes', label: 'Notes' },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function FormRebaseDemo({ saveDelay, onSave, onServerUpdate }: DemoArgs) {
  const form = useObjectPageForm<Invoice>({ baseline: BASELINE });
  const { rebase, conflicts, applied, acceptTheirs, keepMine, isPending } = useFormRebase(form);
  // The record as stored by the simulated server: a save writes it when the request starts, the
  // response comes back after `saveDelay`.
  const server = useRef<Invoice>(BASELINE);

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

  return (
    // Inline styles: the pro stylesheet emits no utilities (only `.rop-pro-*` component classes).
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      {FIELDS.map(({ name, label }) => (
        <Field key={name} label={label} name={name}>
          <Input value={form.values[name]} onChange={(event) => form.setValue(name, event.target.value)} />
        </Field>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="secondary" onClick={simulateServerUpdate}>
          Simulate server update
        </Button>
        <Button
          variant="primary"
          disabled={form.isSaving}
          onClick={() =>
            void form.save(async (values) => {
              server.current = values;
              await wait(saveDelay);
              onSave(values);
              return values;
            })
          }
        >
          {form.isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={() => form.reset()}>
          Discard
        </Button>
      </div>
      <Text role="status">
        {[form.isDirty ? 'Unsaved changes' : 'All saved', isPending ? 'Server update queued until the save ends' : '']
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <section aria-labelledby="rebase-conflicts">
        <h3 id="rebase-conflicts" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Conflicts ({conflicts.length})
        </h3>
        <ul aria-labelledby="rebase-conflicts" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 16 }}>
          {conflicts.map((conflict) => (
            <li key={conflict.path} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Text as="span">
                {`${conflict.label}: yours ${JSON.stringify(conflict.mine)}, server ${JSON.stringify(conflict.theirs)}`}
              </Text>
              <Button size="sm" variant="secondary" onClick={() => acceptTheirs(conflict.path)}>
                {`Accept server value for ${conflict.label}`}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => keepMine(conflict.path)}>
                {`Keep my value for ${conflict.label}`}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="rebase-applied">
        <h3 id="rebase-applied" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Applied server changes ({applied.length})
        </h3>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {JSON.stringify(
            applied.map(({ path, before, after }) => ({ path, before, after })),
            null,
            2,
          )}
        </pre>
      </section>
    </div>
  );
}

/**
 * Minimal check of the merge engine (the real demo is in a later ticket). Edit "Amount" and
 * "Notes", then press "Simulate server update" (the server changes "Supplier" and "Amount"):
 * "Supplier", not touched, takes the server value; "Amount", touched, keeps yours and is listed as
 * a conflict; "Notes" stays yours. "Accept server value" resolves the conflict with the server
 * value. "Save" waits `saveDelay` ms: a server update pressed meanwhile is queued until it ends.
 */
export const Playground: Story = {
  render: (args) => <FormRebaseDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const field = (name: string) => canvas.getByRole('textbox', { name });
    const conflictItems = () => within(canvas.getByRole('list', { name: /Conflicts/ })).queryAllByRole('listitem');

    await userEvent.clear(field('Amount'));
    await userEvent.type(field('Amount'), '120');
    await userEvent.type(field('Notes'), 'Checked by me');
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));

    await waitFor(() => expect(field('Supplier')).toHaveValue('Acme Corp (updated)'));
    await expect(field('Amount')).toHaveValue('120');
    await expect(field('Notes')).toHaveValue('Checked by me');
    await expect(conflictItems()).toHaveLength(1);
    await expect(conflictItems()[0]).toHaveTextContent('Amount: yours "120", server "150"');
    await expect(canvas.getByRole('status')).toHaveTextContent('Unsaved changes');
    await expect(args.onServerUpdate).toHaveBeenCalledTimes(1);

    await userEvent.click(canvas.getByRole('button', { name: 'Accept server value for Amount' }));
    await expect(field('Amount')).toHaveValue('150');
    await waitFor(() => expect(conflictItems()).toHaveLength(0));
    await expect(field('Notes')).toHaveValue('Checked by me');
    await expect(field('Supplier')).toHaveValue('Acme Corp (updated)');
  },
};

/**
 * `computeRebase({ baseline, values, incoming })`: the pure three-way merge behind `useFormRebase`.
 * Paths the user did not touch take the server value (`applied`), touched paths keep the user's value,
 * paths changed by both sides differently keep the user's value and are listed in `conflicts`. The play
 * function checks the three lists for a draft where the user edited `supplier` and `notes` while the
 * server changed `amount` and `notes`.
 */
export const PureMerge: Story = {
  parameters: { controls: { disable: true } },
  render: () => {
    const result = computeRebase<Invoice>({
      baseline: BASELINE,
      values: { ...BASELINE, supplier: 'Acme Ltd', notes: 'Checked by me' },
      incoming: { ...BASELINE, amount: '120', notes: 'Checked by the server' },
    });
    return (
      <dl style={{ display: 'grid', gap: 8 }}>
        <dt>values</dt>
        <dd data-testid="values">{JSON.stringify(result.values)}</dd>
        <dt>applied</dt>
        <dd data-testid="applied">{result.applied.map((entry) => entry.label).join(', ')}</dd>
        <dt>conflicts</dt>
        <dd data-testid="conflicts">{result.conflicts.map((conflict) => conflict.label).join(', ')}</dd>
      </dl>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('applied')).toHaveTextContent('Amount');
    await expect(canvas.getByTestId('conflicts')).toHaveTextContent('Notes');
    await expect(canvas.getByTestId('values')).toHaveTextContent('"supplier":"Acme Ltd"');
    await expect(canvas.getByTestId('values')).toHaveTextContent('"amount":"120"');
    await expect(canvas.getByTestId('values')).toHaveTextContent('"notes":"Checked by me"');
  },
};
