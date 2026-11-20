// #583: the review dialog of the record-editing shell reads `confirmDisabledReason` at every render. From the review
// itself (`reviewSave`, fixed when Save is pressed) and from the add-ons (`useAddons`, live): a reason that appears
// while the review is open makes "Save changes" `aria-disabled` without moving the focus, and confirming saves nothing.
import { useSyncExternalStore } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { ObjectPageSection } from '../object-page/ObjectPageSection';
import type { RecordModule, RecordSectionsProps } from './record-module';
import { createRecordStore, type RecordStore } from './record-store';
import { RecordEditor, type RecordSaveReview, type RecordSaveReviewer } from './RecordPageShell';

interface Thing {
  id: string;
  label: string;
}
type ThingValues = Omit<Thing, 'id'>;

const THING: Thing = { id: 't-1', label: 'Anvil' };
const REASON = 'This thing was deleted on the server: it can no longer be saved.';
const STATIC_REASON = 'Saving is closed for the night.';

function ThingSections({ form }: RecordSectionsProps<Thing, ThingValues>) {
  return (
    <ObjectPageSection id="thing" title="Thing">
      <Field label="Label" name="label">
        <Input value={form.values.label} onChange={(e) => form.setValue('label', e.target.value)} />
      </Field>
    </ObjectPageSection>
  );
}

const THINGS: RecordModule<Thing, ThingValues> = {
  name: 'things',
  noun: { one: 'thing', many: 'things' },
  createStore: () => createRecordStore<Thing>([THING], { createId: (n) => `t-new-${n}` }),
  recordName: (t) => t.label,
  list: { columns: [{ id: 'label', header: 'Label', accessor: (t) => t.label }], filters: [{ id: 'all', label: 'All' }], linkColumn: 'label', labels: {} },
  form: {
    toValues: ({ label }) => ({ label }),
    isEqual: (a, b) => a.label === b.label,
    validate: () => ({}),
    toRecord: (t, v) => ({ ...t, ...v }),
    Sections: ThingSections,
  },
};

/** What the add-on says, changed by the test while the review is open (a tiny external store). */
function createReason() {
  let value: string | undefined;
  const listeners = new Set<() => void>();
  return {
    set(next: string | undefined) {
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: () => value,
  };
}

/** The add-ons of the test: only the live reason. */
function reasonAddons(live: ReturnType<typeof createReason>) {
  return function useReasonAddons() {
    return { confirmDisabledReason: useSyncExternalStore(live.subscribe, live.get, live.get) };
  };
}

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const REVIEW: RecordSaveReview = { title: 'Review changes', description: '1 change will be saved.', confirmLabel: 'Save changes', cancelLabel: 'Keep editing', tone: 'default', initialFocus: 'cancel' };

function renderEditor({ reviewSave = () => REVIEW, live = createReason() }: { reviewSave?: RecordSaveReviewer<ThingValues>; live?: ReturnType<typeof createReason> } = {}) {
  const store: RecordStore<Thing> = THINGS.createStore();
  const save = vi.spyOn(store, 'save');
  render(
    <RecordEditor
      module={THINGS}
      store={store}
      record={THING}
      onBack={vi.fn()}
      focusTitleOnMount={false}
      reviewSave={reviewSave}
      useAddons={reasonAddons(live)}
    />,
  );
  return { store, save, live };
}

const footerSave = () => within(screen.getByRole('region', { name: 'Save actions' })).getByRole('button', { name: 'Save' });

async function openReview() {
  await userEvent.type(screen.getByRole('textbox', { name: 'Label' }), '!');
  await userEvent.click(footerSave());
  return screen.findByRole('dialog', { name: 'Review changes' });
}

describe('RecordEditor: the review dialog\'s confirmDisabledReason (#583)', () => {
  it('from the add-ons, appearing while the review is open: aria-disabled, described, the focus kept, nothing saved; gone, Save changes saves', async () => {
    const { save, live } = renderEditor();
    const dialog = await openReview();
    const confirm = within(dialog).getByRole('button', { name: 'Save changes' });
    await userEvent.tab();
    expect(confirm).toHaveFocus();
    expect(confirm).not.toHaveAttribute('aria-disabled');
    act(() => live.set(REASON));
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveAccessibleDescription(REASON);
    expect(confirm).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(confirm);
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Review changes' })).toBe(dialog);
    act(() => live.set(undefined));
    expect(confirm).not.toHaveAttribute('aria-disabled');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toEqual({ id: 't-1', label: 'Anvil!' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('from the review itself (`reviewSave`): unavailable from the start; Keep editing closes it, the focus back on Save, nothing saved', async () => {
    const { save } = renderEditor({ reviewSave: () => ({ ...REVIEW, confirmDisabledReason: STATIC_REASON }) });
    const dialog = await openReview();
    const confirm = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveAccessibleDescription(STATIC_REASON);
    await userEvent.click(confirm);
    expect(save).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(footerSave()).toHaveFocus());
    expect(save).not.toHaveBeenCalled();
  });

  it('the add-ons\' reason wins over the review\'s; gone, the review\'s is back', async () => {
    const live = createReason();
    live.set(REASON);
    renderEditor({ reviewSave: () => ({ ...REVIEW, confirmDisabledReason: STATIC_REASON }), live });
    const dialog = await openReview();
    const confirm = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(confirm).toHaveAccessibleDescription(REASON);
    act(() => live.set(undefined));
    expect(confirm).toHaveAccessibleDescription(STATIC_REASON);
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
  });

  it('no reason at all: "Save changes" saves once and the dialog closes, as before', async () => {
    const { save } = renderEditor();
    const dialog = await openReview();
    const confirm = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(confirm).not.toHaveAttribute('aria-disabled');
    expect(confirm).not.toHaveAttribute('aria-describedby');
    await userEvent.dblClick(confirm);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(save).toHaveBeenCalledTimes(1);
  });
});
