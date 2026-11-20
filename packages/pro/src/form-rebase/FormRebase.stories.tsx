import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button, Field, Input, Text, useObjectPageForm } from '@formrail/core';
import { exampleStory } from '../../../core/src/internal/example-story';
import { storyControl, storyControls } from '../../../core/src/internal/story-docs';
import { BESIDE_INPUT } from '../internal/story-layout';
import type { ChangeSummaryOptions } from '../change-summary/types';
import { computeRebase } from './compute-rebase';
import { useFormRebase } from './use-form-rebase';

type RowLabels = 'position' | 'name';

interface DemoArgs {
  /** Duration of the simulated save, in milliseconds. */
  saveDelay: number;
  /** Wired to Actions: called with the values sent by "Save". */
  onSave: (values: unknown) => void;
  /** Wired to Actions: called with the incoming version when "Simulate server update" is pressed. */
  onServerUpdate: (incoming: unknown) => void;
  /** Story-only, `RowConflicts` and `MovedRowConflict`: `name` passes an `itemLabel`, `position` passes none. */
  rowLabels?: RowLabels;
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

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('FormRebase.example.tsx') };

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
  tags: ['playground'],
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

// ---------------------------------------------------------------------------------------------
// Rows identified by id (#534): `itemLabel` names the rows of `applied` and of the conflicts, and an open conflict
// is named at the row's CURRENT position, with the row as it is now (moved, renamed, rows added or removed above).
// ---------------------------------------------------------------------------------------------

interface Row {
  id: string;
  name: string;
  /** Text, as an input gives it. */
  quantity: string;
}

interface Order {
  lineItems: Row[];
}

const ORDER: Order = {
  lineItems: [
    { id: 'line-1', name: 'Desk', quantity: '1' },
    { id: 'line-2', name: 'Chair', quantity: '4' },
    { id: 'line-3', name: 'Lamp', quantity: '2' },
  ],
};

const ROW_ID_KEYS = { lineItems: 'id' } as const;
const ROW_LABELS = { lineItems: 'Line items' } as const;
/** The rows the simulated server update changes, by id: another user adds 10 to their quantity. */
const SERVER_ROWS = new Set(['line-2', 'line-3']);

/**
 * `UseFormRebaseOptions.itemLabel` of the stories, at module scope so `useFormRebase` keeps its `conflicts` between
 * renders (compared by identity): a row is named by its name, `Item 2 (Chair)`; a blank name keeps `Item N`.
 */
const nameRows: NonNullable<ChangeSummaryOptions<object>['itemLabel']> = (arrayPath, item, { defaultLabel }) => {
  const name = arrayPath === 'lineItems' && typeof item === 'object' && item !== null ? (item as Partial<Row>).name : undefined;
  return typeof name === 'string' && name.trim() !== '' ? `${defaultLabel} (${name.trim()})` : undefined;
};

/** `items` with the item at `index` swapped with the one before it. */
function movedUp<T>(items: readonly T[], index: number): T[] {
  const next = [...items];
  [next[index - 1], next[index]] = [next[index] as T, next[index - 1] as T];
  return next;
}

function RowConflictsDemo({ onServerUpdate, rowLabels = 'position' }: DemoArgs) {
  const form = useObjectPageForm<Order>({ baseline: ORDER });
  const { rebase, conflicts, applied, acceptTheirs, keepMine } = useFormRebase(form, {
    arrayIdKeys: ROW_ID_KEYS,
    labels: ROW_LABELS,
    itemLabel: rowLabels === 'name' ? nameRows : undefined,
  });
  // The record as stored by the simulated server.
  const server = useRef<Order>(ORDER);
  const lines = form.values.lineItems;

  // Another user adds 10 to the quantity of "Chair" and "Lamp" (found by id, wherever they are).
  const simulateServerUpdate = () => {
    const incoming: Order = {
      lineItems: server.current.lineItems.map((row) =>
        SERVER_ROWS.has(row.id) ? { ...row, quantity: String(Number(row.quantity) + 10) } : row,
      ),
    };
    server.current = incoming;
    onServerUpdate(incoming);
    rebase(incoming);
  };

  // Another update, on another field (#584): another user renames "Desk". The open conflicts stay open.
  const simulateAnotherServerUpdate = () => {
    const incoming: Order = {
      lineItems: server.current.lineItems.map((row) => (row.id === 'line-1' ? { ...row, name: 'Standing desk' } : row)),
    };
    server.current = incoming;
    onServerUpdate(incoming);
    rebase(incoming);
  };

  const setLines = (lineItems: Row[]) => form.setValue('lineItems', lineItems);
  const update = (id: string, patch: Partial<Row>) => setLines(lines.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <ul aria-label="Line items" style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>
        {lines.map((row, index) => (
          <li key={row.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
            <Field label={`Name of line ${index + 1}`} name={`lineItems.${index}.name`}>
              <Input value={row.name} onChange={(event) => update(row.id, { name: event.target.value })} />
            </Field>
            <Field label={`Quantity of line ${index + 1}`} name={`lineItems.${index}.quantity`}>
              <Input inputMode="numeric" value={row.quantity} onChange={(event) => update(row.id, { quantity: event.target.value })} />
            </Field>
            <div style={BESIDE_INPUT} data-testid="row-actions">
              <Button variant="secondary" size="sm" onClick={() => setLines(movedUp(lines, index))} disabled={index === 0}>
                {`Move line ${index + 1} up`}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setLines(lines.filter((r) => r.id !== row.id))}>
                {`Remove line ${index + 1}`}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="secondary" onClick={simulateServerUpdate}>
          Simulate server update
        </Button>
        <Button variant="secondary" onClick={simulateAnotherServerUpdate}>
          Simulate another server update
        </Button>
        <Button variant="secondary" onClick={() => form.reset()}>
          Discard
        </Button>
      </div>
      <section aria-labelledby="row-conflicts">
        <h3 id="row-conflicts" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Conflicts ({conflicts.length})
        </h3>
        <ul aria-labelledby="row-conflicts" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 16 }}>
          {conflicts.map((conflict) => (
            <li key={conflict.path} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Text as="span">{`${conflict.label}: yours ${JSON.stringify(conflict.mine)}, server ${JSON.stringify(conflict.theirs)}`}</Text>
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
      <section aria-labelledby="row-applied">
        <h3 id="row-applied" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Applied server changes ({applied.length})
        </h3>
        <ul aria-labelledby="row-applied" style={{ margin: 0, paddingLeft: 16 }}>
          {applied.map((entry) => (
            <li key={entry.path}>
              <Text as="span">{`${entry.label}: ${JSON.stringify(entry.before)} → ${JSON.stringify(entry.after)}`}</Text>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const ROW_LABELS_CONTROL = {
  rowLabels: storyControl({
    control: 'radio',
    options: ['position', 'name'],
    description:
      '`name` passes `useFormRebase(form, { itemLabel })`, which names a row by its name (`Item 2 (Chair)`); `position` passes none (`Item N`).',
  }),
};

/** Queries of the rows demo, for the play functions. */
function rowsCanvas(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  return {
    canvas,
    quantity: (line: number) => canvas.getByRole('textbox', { name: `Quantity of line ${line}` }),
    name: (line: number) => canvas.getByRole('textbox', { name: `Name of line ${line}` }),
    /** The text of every conflict, without its buttons. */
    conflictTexts: () =>
      within(canvas.getByRole('list', { name: /^Conflicts/ }))
        .queryAllByRole('listitem')
        .map((li) => li.querySelector('span')?.textContent),
    appliedTexts: () =>
      within(canvas.getByRole('list', { name: /^Applied server changes/ }))
        .queryAllByRole('listitem')
        .map((li) => li.textContent),
  };
}

/**
 * Rows identified by id (`arrayIdKeys: { lineItems: 'id' }`): "Desk", "Chair" and "Lamp". "Simulate server update"
 * adds 10 to the quantity of "Chair" and "Lamp" (another user). A row you did not touch takes the server value and is
 * listed under "Applied server changes"; a quantity you changed too is a conflict. With the `rowLabels` Control on
 * `name`, `itemLabel` names the rows (`Line items > Item 2 (Chair) > Quantity`); on `position` they stay `Item N`.
 * The play function changes the quantity of "Chair", simulates the update, removes "Desk" above it (the conflict
 * follows the row to `Item 1`) and accepts the server value.
 */
export const RowConflicts: Story = {
  args: { rowLabels: 'position' },
  argTypes: ROW_LABELS_CONTROL,
  // No save in this demo: the save delay would change nothing.
  parameters: { controls: { exclude: ['saveDelay', 'onSave'] } },
  render: (args) => <RowConflictsDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const { canvas, quantity, conflictTexts, appliedTexts } = rowsCanvas(canvasElement);
    /** `Item N (name)` with `rowLabels: 'name'`, `Item N` with `position`. */
    const row = (n: number, name: string) => (args.rowLabels === 'name' ? `Item ${n} (${name})` : `Item ${n}`);

    await userEvent.clear(quantity(2));
    await userEvent.type(quantity(2), '5');
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));

    // "Lamp", untouched, takes the server value; "Chair" keeps yours and is a conflict.
    await waitFor(() => expect(quantity(3)).toHaveValue('12'));
    await expect(quantity(2)).toHaveValue('5');
    await expect(conflictTexts()).toEqual([`Line items > ${row(2, 'Chair')} > Quantity: yours "5", server "14"`]);
    await expect(appliedTexts()).toEqual([`Line items > ${row(3, 'Lamp')} > Quantity: "2" → "12"`]);
    await expect(args.onServerUpdate).toHaveBeenCalledTimes(1);

    // "Desk" removed above the conflict: the conflict follows "Chair" to the first position.
    await userEvent.click(canvas.getByRole('button', { name: 'Remove line 1' }));
    await waitFor(() => expect(conflictTexts()).toEqual([`Line items > ${row(1, 'Chair')} > Quantity: yours "5", server "14"`]));

    await userEvent.click(canvas.getByRole('button', { name: `Accept server value for Line items > ${row(1, 'Chair')} > Quantity` }));
    await expect(quantity(1)).toHaveValue('14');
    await waitFor(() => expect(conflictTexts()).toEqual([]));
  },
};

/**
 * A conflict on a row you then move: `itemLabel` (`rowLabels: name`) names the conflict with the row at its CURRENT
 * position, as it is now. The play function changes the quantity of "Lamp" (third line), simulates the server update
 * (the conflict reads `Line items > Item 3 (Lamp) > Quantity`), moves "Lamp" up twice (`Item 1 (Lamp)`), renames it
 * "Desk lamp" (`Item 1 (Desk lamp)`) and keeps its own value: the choice buttons carry the same name.
 *
 * Several updates in a row (#584): "Simulate another server update" renames "Desk" (another field). The play then
 * changes the quantity of "Chair", simulates the update (conflicts on "Lamp" and "Chair") and the other update: the two
 * conflicts of the first update stay open (they accumulate until resolved), while "Applied server changes" lists the
 * last update only (the rename). It ends by resolving them one by one.
 */
export const MovedRowConflict: Story = {
  args: { rowLabels: 'name' },
  argTypes: ROW_LABELS_CONTROL,
  parameters: { controls: { exclude: ['saveDelay', 'onSave'] } },
  render: (args) => <RowConflictsDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const { canvas, quantity, name, conflictTexts } = rowsCanvas(canvasElement);
    /** The Lamp row at position `n`: `Item n (name)` with `rowLabels: 'name'`, `Item n` with `position`. */
    const lamp = (n: number, rowName: string) =>
      `Line items > ${args.rowLabels === 'name' ? `Item ${n} (${rowName})` : `Item ${n}`} > Quantity`;

    await userEvent.clear(quantity(3));
    await userEvent.type(quantity(3), '7');
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));
    await waitFor(() => expect(conflictTexts()).toEqual([`${lamp(3, 'Lamp')}: yours "7", server "12"`]));

    // "Lamp" moved to the first line: the conflict follows it.
    await userEvent.click(canvas.getByRole('button', { name: 'Move line 3 up' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Move line 2 up' }));
    await expect(name(1)).toHaveValue('Lamp');
    await waitFor(() => expect(conflictTexts()).toEqual([`${lamp(1, 'Lamp')}: yours "7", server "12"`]));

    // Renamed: the label reads the row as it is now.
    await userEvent.clear(name(1));
    await userEvent.type(name(1), 'Desk lamp');
    await waitFor(() => expect(conflictTexts()).toEqual([`${lamp(1, 'Desk lamp')}: yours "7", server "12"`]));

    await userEvent.click(canvas.getByRole('button', { name: `Keep my value for ${lamp(1, 'Desk lamp')}` }));
    await waitFor(() => expect(conflictTexts()).toEqual([]));
    await expect(quantity(1)).toHaveValue('7');
    await expect(args.onServerUpdate).toHaveBeenCalledTimes(1);

    // Two server updates in a row before resolving (#584). Lines now: "Desk lamp", "Desk", "Chair".
    const { appliedTexts } = rowsCanvas(canvasElement);
    const chair = `Line items > ${args.rowLabels === 'name' ? 'Item 3 (Chair)' : 'Item 3'} > Quantity`;
    await userEvent.clear(quantity(3));
    await userEvent.type(quantity(3), '5');
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));
    const both = [`${lamp(1, 'Desk lamp')}: yours "7", server "22"`, `${chair}: yours "5", server "24"`];
    await waitFor(() => expect(conflictTexts()).toEqual(both));
    // The other update renames "Desk" only: the conflicts of the first one stay open, applied is the rename.
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate another server update' }));
    await waitFor(() => expect(name(2)).toHaveValue('Standing desk'));
    await expect(conflictTexts()).toEqual(both);
    await expect(appliedTexts()).toEqual([
      `Line items > ${args.rowLabels === 'name' ? 'Item 2 (Standing desk)' : 'Item 2'} > Name: "Desk" → "Standing desk"`,
    ]);
    await expect(args.onServerUpdate).toHaveBeenCalledTimes(3);

    // Resolved one by one: the other stays.
    await userEvent.click(canvas.getByRole('button', { name: `Accept server value for ${chair}` }));
    await expect(quantity(3)).toHaveValue('24');
    await waitFor(() => expect(conflictTexts()).toEqual([both[0]]));
    await userEvent.click(canvas.getByRole('button', { name: `Keep my value for ${lamp(1, 'Desk lamp')}` }));
    await waitFor(() => expect(conflictTexts()).toEqual([]));
    await expect(quantity(1)).toHaveValue('7');
  },
};
