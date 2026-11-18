import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { ObjectPageSection } from '../object-page/ObjectPageSection';
import type { RecordHeaderActionsProps, RecordModule, RecordSectionsProps } from './record-module';
import { createRecordStore } from './record-store';
import { RecordCrud } from './RecordCrud';
import { openCreate } from './showcase-router';

// #523: the two optional hooks a module gives the shell since the customers: `list.getSearchText` (the search matches
// a text that is not a column) and `form.HeaderActions` (the module's own header actions, on an existing record only,
// with `saveRecord`). A made-up module, registered on its own.
vi.mock('./showcase-modules', () => ({ SHOWCASE_MODULES: ['things'] }));

interface Thing {
  id: string;
  label: string;
  /** Not a column: only the module's search text has it. */
  place: string;
  state: 'open' | 'closed';
}
type ThingValues = Omit<Thing, 'id'>;

const SEED: readonly Thing[] = [
  { id: 't-1', label: 'Anvil', place: 'Hamburg', state: 'open' },
  { id: 't-2', label: 'Bucket', place: 'Lisbon', state: 'closed' },
  { id: 't-3', label: 'Crate', place: 'Oslo', state: 'open' },
];

function ThingSections({ form }: RecordSectionsProps<Thing, ThingValues>) {
  return (
    <ObjectPageSection id="thing" title="Thing">
      <Field label="Label" name="label">
        <Input value={form.values.label} onChange={(e) => form.setValue('label', e.target.value)} />
      </Field>
    </ObjectPageSection>
  );
}

const seen: RecordHeaderActionsProps<Thing, ThingValues>[] = [];
function ThingActions(props: RecordHeaderActionsProps<Thing, ThingValues>) {
  seen.push(props);
  const [result, setResult] = useState('');
  return (
    <>
      <Button
        variant="secondary"
        onClick={async () => {
          const stored = await props.saveRecord({ ...props.record, state: 'closed' });
          setResult(`stored ${stored.state}`);
        }}
      >
        Close it
      </Button>
      <span>{result}</span>
    </>
  );
}

const THINGS: RecordModule<Thing, ThingValues> = {
  name: 'things',
  noun: { one: 'thing', many: 'things' },
  createStore: () => createRecordStore<Thing>(SEED, { createId: (n) => `t-new-${n}`, noun: { one: 'thing', many: 'things' } }),
  recordName: (t) => t.label,
  list: {
    columns: [{ id: 'label', header: 'Label', accessor: (t) => t.label }],
    filters: [{ id: 'all', label: 'All' }],
    linkColumn: 'label',
    labels: {},
    getSearchText: (t) => t.place,
  },
  form: {
    toValues: ({ label, place, state }) => ({ label, place, state }),
    isEqual: (a, b) => a.label === b.label && a.place === b.place && a.state === b.state,
    validate: () => ({}),
    toRecord: (t, v) => ({ ...t, ...v }),
    Sections: ThingSections,
    HeaderActions: ThingActions,
  },
  create: { defaults: () => ({ label: '', place: '', state: 'open' }), toDraft: (v) => v },
  delete: true,
};

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/');
  seen.length = 0;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderShell = (onSaved = vi.fn()) => {
  render(
    <RecordCrud
      module={THINGS}
      history="replace"
      listLoadDelayMs={0}
      recordLoadDelayMs={0}
      saveDelayMs={0}
      onNavigate={vi.fn()}
      onSaved={onSaved}
      addons={{ things: { useAddons: () => ({ actions: <Button variant="secondary">Add-on action</Button> }) } }}
    />,
  );
  return { onSaved };
};
const links = () => screen.queryAllByRole('link').map((l) => l.textContent);
const search = async (text: string) => {
  const box = screen.getByRole('searchbox', { name: 'Search' });
  await userEvent.clear(box);
  if (text) await userEvent.type(box, `${text}{Enter}`);
  else await userEvent.type(box, '{Enter}');
};

describe('list.getSearchText (#523)', () => {
  it('the search matches the module text (not a column) and no longer the columns', async () => {
    renderShell();
    await waitFor(() => expect(links()).toEqual(['Anvil', 'Bucket', 'Crate']));
    await search('lisbon');
    await waitFor(() => expect(links()).toEqual(['Bucket']));
    // "Anvil" is a column, not the search text: no match.
    await search('anvil');
    await waitFor(() => expect(links()).toEqual([]));
  });
});

describe('form.HeaderActions (#523)', () => {
  it('on an existing record: after the shell actions, before the add-on ones, with the form, the record and saveRecord', async () => {
    const { onSaved } = renderShell();
    await waitFor(() => expect(links()).toContain('Bucket'));
    await userEvent.click(screen.getByRole('link', { name: 'Anvil' }));
    const close = await screen.findByRole('button', { name: 'Close it' });
    const header = screen.getByRole('heading', { level: 1 }).parentElement!.parentElement!.parentElement!;
    expect(within(header).getAllByRole('button').map((b) => b.textContent)).toEqual(['Back to list', 'Delete', 'Close it', 'Add-on action']);
    const props = seen.at(-1)!;
    expect(props.record).toEqual(SEED[0]);
    expect(props.form.values).toEqual({ label: 'Anvil', place: 'Hamburg', state: 'open' });
    // saveRecord writes through the page's store and reports it like a Save; it touches no state of the form.
    await userEvent.click(close);
    expect(await screen.findByText('stored closed')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({ ...SEED[0], state: 'closed' });
    const store = (window as unknown as { __ropShowcaseStore: { snapshot: () => Thing[] } }).__ropShowcaseStore;
    expect(store.snapshot().find((t) => t.id === 't-1')!.state).toBe('closed');
    expect(seen.at(-1)!.form.baseline.state).toBe('open');
    expect(seen.at(-1)!.form.isDirty).toBe(false);
  });

  it('a failed saveRecord rejects with the store error and reports nothing', async () => {
    const onSaved = vi.fn();
    render(
      <RecordCrud
        module={THINGS}
        history="replace"
        listLoadDelayMs={0}
        recordLoadDelayMs={0}
        saveDelayMs={0}
        saveOutcome="error"
        onNavigate={vi.fn()}
        onSaved={onSaved}
      />,
    );
    await waitFor(() => expect(links()).toContain('Anvil'));
    await userEvent.click(screen.getByRole('link', { name: 'Anvil' }));
    await screen.findByRole('button', { name: 'Close it' });
    await expect(seen.at(-1)!.saveRecord({ ...SEED[0]!, state: 'closed' })).rejects.toThrow(/Could not save the thing/);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('never on the creation page (there is no record yet)', async () => {
    renderShell();
    await waitFor(() => expect(links()).toContain('Anvil'));
    openCreate('things');
    expect(await screen.findByRole('heading', { level: 1, name: 'New thing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close it' })).toBeNull();
    expect(seen).toHaveLength(0);
  });
});
