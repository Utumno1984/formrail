import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button, Field, Input, Text, useFieldControl, useObjectPageForm } from '@formrail/core';
import { exampleStory } from '../../../core/src/internal/example-story';
import { storyControl, withoutControls } from '../../../core/src/internal/story-docs';
import { ChangeSummary } from './ChangeSummary';
import { formatChangeValue } from './format-change-value';
import { inferSegmentLabel } from './infer-label';
import { computeChangeSummary } from './compute-change-summary';
import { useChangeSummary } from './use-change-summary';
import type { ChangeEntry, ChangeSummaryOptions } from './types';

type Locale = 'en-US' | 'en-GB' | 'de-DE';
type TimeZone = 'UTC' | 'Europe/Rome' | 'America/New_York';
type RowLabels = 'position' | 'name';

interface DemoArgs {
  emptyLabel: string;
  label: string;
  locale: Locale;
  timeZone: TimeZone;
  /** Story-only: `currency` maps to a `renderValue` that formats `amount` as money. */
  valueFormat: 'default' | 'currency';
  /** Wired to Actions: called only when the user presses "Save". */
  onSave: (values: unknown) => void;
  /** Wired to Actions: called only when the user presses "Discard". */
  onDiscard: () => void;
  /** Story-only, `RowLabelsAndReorders`: `name` passes an `itemLabel`, `position` passes none. */
  rowLabels?: RowLabels;
}

const meta: Meta<DemoArgs> = {
  title: 'Pro/ChangeSummary',
  // The stories drive the component through a demo editor (`Meta<DemoArgs>`): `never` keeps the props
  // table of the real component without forcing the demo's args to match its props.
  component: ChangeSummary as never,
  parameters: { layout: 'padded' },
  argTypes: {
    emptyLabel: { control: 'text' },
    label: { control: 'text' },
    locale: { control: 'select', options: ['en-US', 'en-GB', 'de-DE'] },
    timeZone: { control: 'select', options: ['UTC', 'Europe/Rome', 'America/New_York'] },
    // Set by the demo (`entries` from useChangeSummary, `renderValue` from the control below).
    ...withoutControls('entries', 'renderValue', 'valueLabels'),
    valueFormat: storyControl({
      control: 'radio',
      options: ['default', 'currency'],
      description: '`currency` passes a `renderValue` that shows `amount` as money.',
    }),
    onSave: storyControl({ control: false, description: 'The demo editor\'s "Save" button (receives the form values).' }),
    onDiscard: storyControl({ control: false, description: 'The demo editor\'s "Discard" button.' }),
  },
  args: {
    emptyLabel: 'No changes',
    label: 'Changes',
    locale: 'en-US',
    timeZone: 'UTC',
    valueFormat: 'default',
    onSave: fn(),
    onDiscard: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('ChangeSummary.example.tsx') };

// ---------------------------------------------------------------------------------------------
// The demo editor: a real form (`useObjectPageForm` of core, mounted already hydrated) whose
// values feed `useChangeSummary` and `<ChangeSummary />`.
// ---------------------------------------------------------------------------------------------

interface Line {
  id: string;
  description: string;
  price: number;
}

interface InvoiceValues {
  amount: string;
  paid: boolean;
  dueDate: Date;
  lineItems: Line[];
}

// Noon UTC: the same calendar day in every time zone of the controls but the far east ones.
const BASELINE: InvoiceValues = {
  amount: '100',
  paid: false,
  dueDate: new Date('2026-03-05T12:00:00Z'),
  lineItems: [
    { id: 'line-1', description: 'Desk', price: 60 },
    { id: 'line-2', description: 'Chair', price: 40 },
  ],
};

const ARRAY_ID_KEYS = { lineItems: 'id' } as const;

/**
 * `ChangeSummaryOptions.itemLabel` of the stories, at module scope so `useChangeSummary` keeps its result between
 * renders (compared by identity, like `isEqual`). A row is named by its description, a tax by its code:
 * `Item 2 (Chair)`, `Item 1 (VAT)`; a blank name returns `undefined`, which keeps `Item N`.
 */
const nameRows: NonNullable<ChangeSummaryOptions<object>['itemLabel']> = (arrayPath, item, { defaultLabel }) => {
  const field = arrayPath === 'lineItems' ? 'description' : arrayPath === 'lineItems.taxes' ? 'code' : undefined;
  const name = field !== undefined && typeof item === 'object' && item !== null ? (item as Record<string, unknown>)[field] : undefined;
  return typeof name === 'string' && name.trim() !== '' ? `${defaultLabel} (${name.trim()})` : undefined;
};

function PaidCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const control = useFieldControl();
  return (
    <input
      {...control}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      style={{ width: 16, height: 16 }}
    />
  );
}

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

function EditorDemo({ emptyLabel, label, locale, timeZone, valueFormat, onSave, onDiscard }: DemoArgs) {
  const form = useObjectPageForm<InvoiceValues>({ baseline: BASELINE });
  const { values } = form;
  const { entries } = useChangeSummary({ values, baseline: form.baseline, arrayIdKeys: ARRAY_ID_KEYS });
  const [nextId, setNextId] = useState(3);

  const setLines = (lineItems: Line[]) => form.setValue('lineItems', lineItems);
  const move = (index: number, by: -1 | 1) => {
    const next = [...values.lineItems];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target] as Line, next[index] as Line];
    setLines(next);
  };

  const renderValue =
    valueFormat === 'currency'
      ? (value: unknown, entry: ChangeEntry): ReactNode =>
          entry.path === 'amount' && value !== '' && !Number.isNaN(Number(value))
            ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(Number(value))
            : formatChangeValue(value, { locale, timeZone })
      : undefined;

  return (
    // Inline styles: the pro stylesheet emits no utilities (only `.rop-pro-*` component classes).
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <Field label="Amount" name="amount">
        <Input value={values.amount} onChange={(event) => form.setValue('amount', event.target.value)} />
      </Field>
      <Field label="Paid" name="paid">
        <PaidCheckbox checked={values.paid} onChange={(paid) => form.setValue('paid', paid)} />
      </Field>
      <Field label="Due date" name="dueDate">
        <Input
          type="date"
          value={toDateInput(values.dueDate)}
          onChange={(event) => {
            const next = new Date(`${event.target.value}T12:00:00Z`);
            if (!Number.isNaN(next.getTime())) form.setValue('dueDate', next);
          }}
        />
      </Field>
      <ul
        aria-label="Line items"
        style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}
      >
        {values.lineItems.map((line, index) => (
          <li key={line.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Text as="span" style={{ minWidth: 96 }}>
              {line.description} ({line.price})
            </Text>
            <Button variant="secondary" size="sm" onClick={() => move(index, -1)} disabled={index === 0}>
              {`Move line ${index + 1} up`}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLines(values.lineItems.filter((l) => l.id !== line.id))}
            >
              {`Remove line ${index + 1}`}
            </Button>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          variant="secondary"
          onClick={() => {
            setLines([...values.lineItems, { id: `line-${nextId}`, description: 'New line', price: 10 }]);
            setNextId(nextId + 1);
          }}
        >
          Add line
        </Button>
        <Button variant="primary" onClick={() => void form.save((v) => onSave(v))}>
          Save
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            form.reset();
            onDiscard();
          }}
        >
          Discard
        </Button>
      </div>
      <ChangeSummary
        entries={entries}
        emptyLabel={emptyLabel}
        label={label}
        locale={locale}
        timeZone={timeZone}
        renderValue={renderValue}
      />
    </div>
  );
}

const isItem = (name: RegExp) => (_: string, el: Element | null) =>
  el?.tagName === 'LI' && name.test(el.textContent ?? '');
const item = (canvas: ReturnType<typeof within>, name: RegExp) => canvas.findByText(isItem(name));

/** Text a screen reader gets: DOM order, visually hidden text included, aria-hidden excluded. */
function readText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return '';
  return Array.from(node.childNodes).map(readText).join('');
}

/**
 * A real editor: change the amount, tick "Paid", add / move / remove lines and watch the summary
 * follow. `emptyLabel`, `label`, `locale`, `timeZone` and `valueFormat` are Controls; "Save" and
 * "Discard" are wired to Actions. The play function checks, in order: the empty state, a changed
 * amount, "Paid" as `No` to `Yes` (never `false` / `true`), a pure reorder (no new entry), an added
 * line, a removed line, the amount restored (its entry disappears) and "Discard" (empty again,
 * `onDiscard` called once).
 */
export const Playground: Story = {
  tags: ['playground'],
  render: (args) => <EditorDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = () => canvas.queryByRole('list', { name: args.label });
    const items = () => within(summary() as HTMLElement).getAllByRole('listitem');

    // Starts empty.
    await expect(canvas.getByText(args.emptyLabel)).toBeVisible();
    await expect(summary()).toBeNull();

    // A changed amount: before and after.
    const amount = canvas.getByRole('textbox', { name: 'Amount' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '120');
    const amountItem = await item(canvas, /^Amount/);
    await expect(amountItem).toHaveTextContent(/changed/);
    // One assertion on the text read (aria-hidden arrow excluded), so the order is checked too:
    // before, then after (`from 100 to 120`, or `from 100,00 € to 120,00 €` with the currency control).
    await expect(readText(amountItem)).toMatch(/^Amount, changed, from [^,]*100[^ ]*( €)? to [^,]*120[^ ]*( €)?$/);
    await expect(items()).toHaveLength(1);

    // A boolean reads Yes / No, never true / false.
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Paid' }));
    const paidItem = await item(canvas, /^Paid/);
    await expect(paidItem).toHaveTextContent(/from\s*No\s*.*to\s*Yes/);
    await expect(paidItem).not.toHaveTextContent(/true|false/);
    await expect(items()).toHaveLength(2);

    // A pure reorder is not a change.
    await userEvent.click(canvas.getByRole('button', { name: 'Move line 2 up' }));
    await expect(canvas.getByText(/Chair \(40\)/).closest('li')?.previousElementSibling).toBeNull();
    await expect(items()).toHaveLength(2);

    // A new line.
    await userEvent.click(canvas.getByRole('button', { name: 'Add line' }));
    const added = await item(canvas, /^Line Items > Item 3/);
    await expect(added).toHaveTextContent(/added/);
    await expect(added).toHaveTextContent(/New line/);
    await expect(items()).toHaveLength(3);

    // A removed line (line 2 is now "Desk", the first of the baseline).
    await userEvent.click(canvas.getByRole('button', { name: 'Remove line 2' }));
    const removed = await item(canvas, /^Line Items > Item 1/);
    await expect(removed).toHaveTextContent(/removed/);
    await expect(removed).toHaveTextContent(/Desk/);
    await expect(items()).toHaveLength(4);

    // The amount back to the saved value: its entry disappears.
    await userEvent.clear(amount);
    await userEvent.type(amount, '100');
    await waitFor(() => expect(canvas.queryByText(isItem(/^Amount/))).toBeNull());
    await expect(items()).toHaveLength(3);

    // Discard: empty again, onDiscard called exactly once.
    await userEvent.click(canvas.getByRole('button', { name: 'Discard' }));
    await expect(canvas.getByText(args.emptyLabel)).toBeVisible();
    await expect(summary()).toBeNull();
    await expect(args.onDiscard).toHaveBeenCalledTimes(1);
  },
};

// ---------------------------------------------------------------------------------------------
// "No value" states: a form whose baseline has `null` and `''`, edited through a real `Input` that
// emits `''` and a clear action that emits `undefined` (what Select and Combobox emit).
// ---------------------------------------------------------------------------------------------

interface NoteValues {
  note: string | null | undefined;
  memo: string;
}

const NOTE_BASELINE: NoteValues = { note: null, memo: '' };

function NoValueDemo({ emptyLabel, label, locale, timeZone }: DemoArgs) {
  const form = useObjectPageForm<NoteValues>({ baseline: NOTE_BASELINE });
  const { entries } = useChangeSummary({ values: form.values, baseline: form.baseline });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <Field label="Note" name="note">
        <Input value={form.values.note ?? ''} onChange={(event) => form.setValue('note', event.target.value)} />
      </Field>
      <Field label="Memo" name="memo">
        <Input value={form.values.memo} onChange={(event) => form.setValue('memo', event.target.value)} />
      </Field>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="secondary" onClick={() => form.setValue('note', undefined)}>
          Clear note to undefined
        </Button>
        <Button variant="secondary" onClick={() => form.reset()}>
          Discard
        </Button>
      </div>
      <Text>{form.isDirty ? 'Unsaved changes' : 'All saved'}</Text>
      <ChangeSummary entries={entries} emptyLabel={emptyLabel} label={label} locale={locale} timeZone={timeZone} />
    </div>
  );
}

/**
 * `''`, `null`, `undefined` and a missing key are different values: the summary follows the dirty
 * state of the form. Typing and clearing "Note" (baseline `null`) leaves `''`, a real change;
 * typing and clearing "Memo" (baseline `''`) restores the saved value, no change. The clear action
 * shows two no-value states side by side, each with its own text.
 */
export const NoValueStates: Story = {
  render: (args) => <NoValueDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Memo: baseline '', typed and cleared: back to the saved value.
    const memo = canvas.getByRole('textbox', { name: 'Memo' });
    await userEvent.type(memo, 'abc');
    await expect(canvas.getByText('Unsaved changes')).toBeVisible();
    await userEvent.clear(memo);
    await expect(canvas.getByText('All saved')).toBeVisible();
    await expect(canvas.getByText(args.emptyLabel)).toBeVisible();

    // Note: baseline null, typed and cleared: '' is not null.
    const note = canvas.getByRole('textbox', { name: 'Note' });
    await userEvent.type(note, 'abc');
    await userEvent.clear(note);
    await expect(canvas.getByText('Unsaved changes')).toBeVisible();
    await expect(readText(await item(canvas, /^Note/))).toBe('Note, added, Empty');

    // Two no-value states on one entry: never "No value" twice.
    await userEvent.click(canvas.getByRole('button', { name: 'Clear note to undefined' }));
    await expect(readText(await item(canvas, /^Note/))).toBe('Note, changed, from Null to Undefined');

    await userEvent.click(canvas.getByRole('button', { name: 'Discard' }));
    await expect(canvas.getByText('All saved')).toBeVisible();
    await expect(canvas.getByText(args.emptyLabel)).toBeVisible();
  },
};

// ---------------------------------------------------------------------------------------------
// Row labels and reorders (#424): `itemLabel` names the rows (and the taxes inside them) while the
// engine still holds them; `reorders` (from `useChangeSummary`, or `computeChangeSummaryResult` for
// the pure function) lists the id-keyed arrays whose order changed, without adding any entry.
// ---------------------------------------------------------------------------------------------

interface Tax {
  code: string;
  rate: number;
}

interface TaxedLine {
  id: string;
  description: string;
  /** Text, as an input gives it. */
  price: string;
  taxes: Tax[];
}

interface TaxedInvoice {
  lineItems: TaxedLine[];
}

const TAXED_BASELINE: TaxedInvoice = {
  lineItems: [
    { id: 'line-1', description: 'Desk', price: '60', taxes: [{ code: 'VAT', rate: 22 }, { code: 'ECO', rate: 1 }] },
    { id: 'line-2', description: 'Chair', price: '40', taxes: [{ code: 'VAT', rate: 22 }, { code: 'ECO', rate: 2 }] },
    { id: 'line-3', description: 'Lamp', price: '15', taxes: [{ code: 'VAT', rate: 10 }, { code: 'ECO', rate: 1 }] },
  ],
};

const NESTED_ARRAY_ID_KEYS = { lineItems: 'id', 'lineItems.taxes': 'code' } as const;

/** `items` with the item at `index` swapped with the one before it. */
function movedUp<T>(items: readonly T[], index: number): T[] {
  const next = [...items];
  [next[index - 1], next[index]] = [next[index] as T, next[index - 1] as T];
  return next;
}

function RowLabelsDemo({ emptyLabel, label, locale, timeZone, onSave, onDiscard, rowLabels = 'name' }: DemoArgs) {
  const form = useObjectPageForm<TaxedInvoice>({ baseline: TAXED_BASELINE });
  const lines = form.values.lineItems;
  const { entries, reorders } = useChangeSummary({
    values: form.values,
    baseline: form.baseline,
    arrayIdKeys: NESTED_ARRAY_ID_KEYS,
    itemLabel: rowLabels === 'name' ? nameRows : undefined,
  });

  const setLines = (lineItems: TaxedLine[]) => form.setValue('lineItems', lineItems);
  const update = (id: string, patch: Partial<TaxedLine>) =>
    setLines(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <ul
        aria-label="Line items"
        style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', margin: 0, padding: 0 }}
      >
        {lines.map((line, index) => (
          <li key={line.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
              <Field label={`Price of ${line.description}`} name={`lineItems.${index}.price`}>
                <Input
                  inputMode="decimal"
                  value={line.price}
                  onChange={(event) => update(line.id, { price: event.target.value })}
                />
              </Field>
              <Button variant="secondary" size="sm" onClick={() => setLines(movedUp(lines, index))} disabled={index === 0}>
                {`Move ${line.description} up`}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setLines(lines.filter((l) => l.id !== line.id))}>
                {`Remove ${line.description}`}
              </Button>
            </div>
            <ul
              aria-label={`Taxes of ${line.description}`}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}
            >
              {line.taxes.map((tax, taxIndex) => (
                <li key={tax.code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text as="span">{`${tax.code} ${tax.rate}%`}</Text>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => update(line.id, { taxes: movedUp(line.taxes, taxIndex) })}
                    disabled={taxIndex === 0}
                  >
                    {`Move ${tax.code} of ${line.description} up`}
                  </Button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="primary" onClick={() => void form.save((v) => onSave(v))}>
          Save
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            form.reset();
            onDiscard();
          }}
        >
          Discard
        </Button>
      </div>
      <ChangeSummary entries={entries} emptyLabel={emptyLabel} label={label} locale={locale} timeZone={timeZone} />
      {/* `<ChangeSummary />` renders the entries only: the reorders get markup of their own. */}
      {reorders.length > 0 ? (
        <ul aria-label="Reordered lists" style={{ margin: 0, paddingInlineStart: 20 }}>
          {reorders.map((reorder) => (
            <li key={reorder.path}>
              <Text as="span">{`Order changed: ${reorder.label}`}</Text>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * `itemLabel` and `reorders` (`useChangeSummary`; `computeChangeSummaryResult` is the same as a pure function) in
 * a real editor: three saved rows ("Desk", "Chair", "Lamp"), each with two taxes matched by `code`
 * (`arrayIdKeys: { lineItems: 'id', 'lineItems.taxes': 'code' }`). An entry names its row
 * (`Line Items > Item 2 (Chair) > Price`), and moving a row or a tax is listed under "Reordered lists"
 * (`Order changed: Line Items`) instead of becoming an entry. With the `rowLabels` Control on `position` the labels
 * go back to `Item N`. The play function checks, in order: the empty state, a changed price of "Chair", "Chair"
 * moved up (a reorder; its entry follows it to `Item 1`), a tax moved inside "Desk" (a nested reorder named after
 * its row), "Desk" removed (its entry and the one of "Chair", both at position 1, told apart; both reorders gone)
 * and "Discard" (empty again, `onDiscard` called once).
 */
export const RowLabelsAndReorders: Story = {
  args: { rowLabels: 'name' },
  argTypes: {
    rowLabels: storyControl({
      control: 'radio',
      options: ['position', 'name'],
      description:
        '`name` passes an `itemLabel` that names a row by its description and a tax by its code; `position` passes none (`Item N`).',
    }),
  },
  // No `renderValue` in this demo: the value format control would change nothing.
  parameters: { controls: { exclude: ['valueFormat'] } },
  render: (args) => <RowLabelsDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    /** `Item N (name)` with `rowLabels: 'name'`, `Item N` with `position`. */
    const row = (n: number, name: string) => (args.rowLabels === 'position' ? `Item ${n}` : `Item ${n} (${name})`);
    const summary = () => canvas.queryByRole('list', { name: args.label });
    const entryTexts = () =>
      within(summary() as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => readText(li));
    const reordered = () => canvas.queryByRole('list', { name: 'Reordered lists' });
    const reorderTexts = () =>
      within(reordered() as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => li.textContent);

    // 1. Nothing changed: the empty text, no list, no reorder.
    await expect(canvas.getByText(args.emptyLabel)).toBeVisible();
    await expect(summary()).toBeNull();
    await expect(reordered()).toBeNull();

    // 2. The price of "Chair" (the second row) changed: the entry names the row.
    const chairPrice = canvas.getByRole('textbox', { name: 'Price of Chair' });
    await userEvent.clear(chairPrice);
    await userEvent.type(chairPrice, '45');
    await waitFor(() => expect(entryTexts()).toEqual([`Line Items > ${row(2, 'Chair')} > Price, changed, from 40 to 45`]));
    await expect(reordered()).toBeNull();

    // 3. "Chair" moved up: a reorder, not one more entry; the entry follows the row to its new position.
    await userEvent.click(canvas.getByRole('button', { name: 'Move Chair up' }));
    await waitFor(() => expect(reorderTexts()).toEqual(['Order changed: Line Items']));
    await expect(entryTexts()).toEqual([`Line Items > ${row(1, 'Chair')} > Price, changed, from 40 to 45`]);

    // 4. A tax moved inside "Desk" (now the second row): a nested reorder, named after its row.
    await userEvent.click(canvas.getByRole('button', { name: 'Move ECO of Desk up' }));
    await waitFor(() =>
      expect(reorderTexts()).toEqual(['Order changed: Line Items', `Order changed: Line Items > ${row(2, 'Desk')} > Taxes`]),
    );
    await expect(entryTexts()).toHaveLength(1);

    // 5. "Desk" removed: its entry (position 1 in the saved list) and the entry of "Chair" (position 1 now) are
    // told apart by name. Both reorders are gone: the nested one with its row, the top-level one because "Chair"
    // and "Lamp" are back in their saved relative order.
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Desk' }));
    await waitFor(() => expect(reordered()).toBeNull());
    const [chair, desk, ...rest] = entryTexts();
    await expect(chair).toBe(`Line Items > ${row(1, 'Chair')} > Price, changed, from 40 to 45`);
    await expect(desk?.startsWith(`Line Items > ${row(1, 'Desk')}, removed, `)).toBe(true);
    await expect(rest).toEqual([]);

    // 6. Discard: empty again, no reorder, onDiscard called exactly once.
    await userEvent.click(canvas.getByRole('button', { name: 'Discard' }));
    await expect(canvas.getByText(args.emptyLabel)).toBeVisible();
    await expect(summary()).toBeNull();
    await expect(reordered()).toBeNull();
    await expect(args.onDiscard).toHaveBeenCalledTimes(1);
  },
};

// ---------------------------------------------------------------------------------------------
// Static stories (visual regression). Fixed dates at noon UTC, locale and time zone explicit.
// ---------------------------------------------------------------------------------------------

const entry = (
  kind: ChangeEntry['kind'],
  path: string,
  label: string,
  before: unknown,
  after: unknown,
): ChangeEntry => ({
  kind,
  path,
  label,
  labelPath: label.split(' > '),
  before,
  after,
  beforeMissing: false,
  afterMissing: false,
});

const circular: Record<string, unknown> = { name: 'Loop' };
circular.self = circular;

/** Texts from the Controls; locale and time zone are fixed so the pictures never change. */
const fixed = ({ emptyLabel, label }: DemoArgs) =>
  ({ emptyLabel, label, locale: 'en-US', timeZone: 'UTC' }) as const;

// `fixed` pins locale and time zone and these stories have no `renderValue`, so these three controls are inert.
const FIXED_FORMAT = { controls: { exclude: ['locale', 'timeZone', 'valueFormat'] } };

const valueTypes: ChangeEntry[] = [
  entry('changed', 'paid', 'Paid', false, true),
  entry('changed', 'dueDate', 'Due Date', new Date('2026-03-05T12:00:00Z'), new Date('2026-04-01T12:00:00Z')),
  entry('changed', 'invalid', 'Invalid Date', new Date('2026-03-05T12:00:00Z'), new Date('nope')),
  entry('changed', 'note', 'Note', '', 'Paid in cash'),
  entry('changed', 'memo', 'Memo', 'Call back', null),
  entry('changed', 'qty', 'Quantity', 0, 1234567.5),
  entry('changed', 'ratio', 'Ratio', 1, NaN),
  entry('changed', 'tags', 'Tags', [], ['a', 'b', 'c']),
  entry('added', 'lineItems.2', 'Line Items > Item 3', undefined, {
    id: 'line-3',
    description: 'Cable',
    unitPrice: 5,
    taxable: true,
    due: new Date('2026-03-05T12:00:00Z'),
    taxes: [1, 2],
    meta: { a: 1 },
  }),
  entry('removed', 'lineItems.0', 'Line Items > Item 1', 'Desk', undefined),
  entry('added', 'map', 'Unsupported', undefined, new Map([[1, 2]])),
  entry('added', 'circular', 'Circular', undefined, circular),
  // Collisions: the default rendering is the same, so both sides are shown precisely.
  entry('changed', 'c1', 'Same Day', new Date('2026-03-05T10:00:00Z'), new Date('2026-03-05T11:30:00Z')),
  entry('changed', 'c2', 'Close Numbers', 10, 10.0001),
  entry('changed', 'c3', 'Trailing Space', 'abc ', 'abc'),
  entry('changed', 'c4', 'Text Against Number', '5', 5),
];

/** One of each kind of value: booleans, dates, `''` / `null`, numbers, arrays, an added row, odd objects and render collisions. */
export const ValueTypes: Story = {
  tags: ['visual'],
  // `valueTypes` holds an invalid Date on purpose; the Docs "Show code" JSX serializer would call
  // `toISOString()` on it and throw while rendering the story. Show the source text instead.
  parameters: { ...FIXED_FORMAT, docs: { source: { type: 'code' } } },
  render: (args) => <ChangeSummary entries={valueTypes} {...fixed(args)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole('list', { name: 'Changes' });
    const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      await expect(['true', 'false']).not.toContain((n.textContent ?? '').trim());
    }
    await expect(list).not.toHaveTextContent(/GMT|\[object/);
    await expect(canvas.getByText('Invalid date')).toBeVisible();
  },
};

/**
 * No changes: an explicit empty state (decorative icon + text, a group named by `label`, a minimum
 * height equal to a summary with one change), not a list and not a placeholder. A blank `emptyLabel`
 * gives the default text.
 */
export const Empty: Story = {
  tags: ['visual'],
  parameters: FIXED_FORMAT,
  render: (args) => <ChangeSummary entries={[]} {...fixed(args)} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('group', { name: args.label || 'Changes' });
    await expect(group).toHaveTextContent(args.emptyLabel.trim() === '' ? 'No changes' : args.emptyLabel);
    await expect(canvas.queryByRole('list')).toBeNull();
    // The icon is decorative: hidden from the accessibility tree.
    await expect(group.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // The box keeps its declared minimum height (the same as a summary with one change) and nothing moves.
    const root = canvasElement.firstElementChild as HTMLElement;
    const minHeight = parseFloat(getComputedStyle(root).minHeight);
    await expect(minHeight).toBeGreaterThan(0);
    await expect(root.getBoundingClientRect().height).toBeGreaterThanOrEqual(minHeight);
    await expect(document.getAnimations()).toHaveLength(0);
  },
};

const longValue = 'x'.repeat(300);

/** A 300-character value without spaces and a five-level label: everything wraps, nothing overflows. */
export const LongValues: Story = {
  tags: ['visual'],
  parameters: FIXED_FORMAT,
  render: (args) => (
    <ChangeSummary
      entries={[
        entry(
          'changed',
          'a.b.c.d.e',
          'Supplier > Billing Address > Contact Person > Phone Numbers > Mobile Number For Urgent Matters',
          longValue,
          `${longValue}y`,
        ),
        entry('added', 'note', 'Note', undefined, longValue),
      ]}
      {...fixed(args)}
    />
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.firstElementChild as HTMLElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  },
};

const editedBaseline = BASELINE;
const editedValues: InvoiceValues = {
  amount: '120',
  paid: true,
  dueDate: new Date('2026-04-01T12:00:00Z'),
  lineItems: [
    { id: 'line-2', description: 'Chair', price: 45 },
    { id: 'line-3', description: 'Cable', price: 10 },
  ],
};

/**
 * The summary of an edited invoice: a changed amount, due date and flag, a changed, an added and a removed line.
 * The lines are named by `itemLabel`: "Desk" (removed, position 1 in the saved list) and "Chair" (changed, position
 * 1 now) would both read `Item 1` without it.
 */
export const EditedInvoice: Story = {
  tags: ['visual'],
  parameters: FIXED_FORMAT,
  render: (args) => (
    <ChangeSummary
      entries={computeChangeSummary({
        values: editedValues,
        baseline: editedBaseline,
        arrayIdKeys: ARRAY_ID_KEYS,
        itemLabel: nameRows,
      })}
      {...fixed(args)}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
  },
};

const SEGMENTS = ['lineItems', 'LINE_ITEMS', 'vatID', 'address2', 'XMLParser', ''];

/**
 * `inferSegmentLabel(segment)`: the label `computeChangeSummary` gives to an object key when `labels`
 * has no entry for it. Splits camelCase, `_`, `-` and letter/digit boundaries, keeps acronyms and
 * returns `(unnamed)` for an empty segment. The play function checks the table below.
 */
export const InferredLabels: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <table>
      <tbody>
        {SEGMENTS.map((segment) => (
          <tr key={segment}>
            <td>
              <code>inferSegmentLabel({JSON.stringify(segment)})</code>
            </td>
            <td data-testid={`label-${segment}`}>{inferSegmentLabel(segment)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('label-lineItems')).toHaveTextContent('Line Items');
    await expect(canvas.getByTestId('label-LINE_ITEMS')).toHaveTextContent('LINE ITEMS');
    await expect(canvas.getByTestId('label-vatID')).toHaveTextContent('Vat ID');
    await expect(canvas.getByTestId('label-address2')).toHaveTextContent('Address 2');
    await expect(canvas.getByTestId('label-XMLParser')).toHaveTextContent('XML Parser');
    await expect(canvas.getByTestId('label-')).toHaveTextContent('(unnamed)');
  },
};
