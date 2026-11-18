// The contract of `useFormRebase` with several server updates in a row (ticket #584, decision of 2026-11-17: the
// conflicts accumulate until they are resolved), as a suite shared by every form the engine drives: core's
// `useObjectPageForm`, the React Hook Form adapter, the TanStack Form adapter. Same shape as the binding contract of
// `binding-contract.ts` (whose suite and "not blind" lists stay as they are): each check is a plain async function
// run on a `UseContractForm`.
import { act, renderHook } from '@testing-library/react';
import { expect } from 'vitest';
import { useFormRebase, type OpenRebaseConflict, type UseFormRebaseReturn } from '../src/engine';
import { CONTRACT_INITIAL, type ContractInvoice, type UseContractForm } from './binding-contract';

export interface AccumulateCheck {
  name: string;
  run: (use: UseContractForm) => Promise<void>;
}

/** Renders `use` with the rebase engine on its binding. */
function mount(use: UseContractForm) {
  const view = renderHook(() => {
    const form = use(CONTRACT_INITIAL);
    return { ...form, rebase: useFormRebase(form.binding) as UseFormRebaseReturn<ContractInvoice> };
  });
  return { current: () => view.result.current, unmount: () => view.unmount() };
}

type Mounted = ReturnType<typeof mount>;

async function withForm(use: UseContractForm, body: (form: Mounted) => void | Promise<void>): Promise<void> {
  const form = mount(use);
  try {
    await body(form);
  } finally {
    form.unmount();
  }
}

/** A version of the stored record: `CONTRACT_INITIAL` with a name, an amount and a city (a new object each time). */
const server = (patch: { name?: string; amount?: number; city?: string } = {}): ContractInvoice => ({
  name: patch.name ?? CONTRACT_INITIAL.name,
  amount: patch.amount ?? CONTRACT_INITIAL.amount,
  supplier: { city: patch.city ?? CONTRACT_INITIAL.supplier.city, tags: [...CONTRACT_INITIAL.supplier.tags] },
});

/** `[path, base, mine, theirs]` of every open conflict, in order. */
const open = (form: Mounted): unknown[][] =>
  form.current().rebase.conflicts.map((conflict: OpenRebaseConflict) => [conflict.path, conflict.base, conflict.mine, conflict.theirs]);

const rebase = (form: Mounted, incoming: ContractInvoice) => act(() => form.current().rebase.rebase(incoming));

/** The user edits the name and the city. */
const editBoth = (form: Mounted) => {
  act(() => form.current().editName('Mine'));
  act(() => form.current().editCity('Milan'));
};

export const ACCUMULATE_CHECKS: AccumulateCheck[] = [
  {
    name: 'the first update changes an edited field, the second another one: the first conflict stays, applied is the last one',
    run: (use) =>
      withForm(use, (form) => {
        act(() => form.current().editName('Mine'));
        rebase(form, server({ name: 'Theirs' }));
        expect(open(form)).toEqual([['name', 'Acme', 'Mine', 'Theirs']]);
        expect(form.current().rebase.applied).toEqual([]);
        rebase(form, server({ name: 'Theirs', amount: 20 }));
        expect(open(form)).toEqual([['name', 'Acme', 'Mine', 'Theirs']]);
        expect(form.current().rebase.applied.map((entry) => entry.path)).toEqual(['amount']);
        expect(form.current().binding.values).toEqual({ ...server({ amount: 20 }), name: 'Mine' });
      }),
  },
  {
    name: 'two edited fields changed by two updates: the same conflicts whatever the order in which the updates arrive',
    run: async (use) => {
      const conflicts: OpenRebaseConflict[][] = [];
      for (const first of [server({ name: 'Theirs' }), server({ city: 'Rome' })]) {
        await withForm(use, (form) => {
          editBoth(form);
          rebase(form, first);
          expect(form.current().rebase.conflicts).toHaveLength(1);
          rebase(form, server({ name: 'Theirs', city: 'Rome' }));
          expect(open(form)).toEqual([
            ['name', 'Acme', 'Mine', 'Theirs'],
            ['supplier.city', 'Turin', 'Milan', 'Rome'],
          ]);
          expect(form.current().binding.values).toEqual({ ...server(), name: 'Mine', supplier: { city: 'Milan', tags: ['a'] } });
          conflicts.push(form.current().rebase.conflicts);
        });
      }
      expect(conflicts[1]).toEqual(conflicts[0]);
    },
  },
  {
    name: 'a second update on the field of an open conflict: one conflict, theirs the latest value, base the value it replaced',
    run: (use) =>
      withForm(use, (form) => {
        act(() => form.current().editName('Mine'));
        rebase(form, server({ name: 'Theirs 1' }));
        rebase(form, server({ name: 'Theirs 2' }));
        expect(open(form)).toEqual([['name', 'Theirs 1', 'Mine', 'Theirs 2']]);
        act(() => form.current().rebase.acceptTheirs('name'));
        expect(form.current().binding.values.name).toBe('Theirs 2');
        expect(form.current().rebase.conflicts).toEqual([]);
      }),
  },
  {
    name: 'a second update that takes the field back to the value before the first keeps the conflict open',
    run: (use) =>
      withForm(use, (form) => {
        act(() => form.current().editName('Mine'));
        rebase(form, server({ name: 'Theirs' }));
        rebase(form, server());
        expect(open(form)).toEqual([['name', 'Theirs', 'Mine', 'Acme']]);
      }),
  },
  {
    name: "a second update that brings the field to the user's value closes the conflict",
    run: (use) =>
      withForm(use, (form) => {
        act(() => form.current().editName('Mine'));
        rebase(form, server({ name: 'Theirs' }));
        rebase(form, server({ name: 'Mine', amount: 20 }));
        expect(form.current().rebase.conflicts).toEqual([]);
        expect(form.current().binding.values).toEqual(server({ name: 'Mine', amount: 20 }));
      }),
  },
  {
    name: 'a conflict resolved between the two updates stays closed, unless the second update changes that field again',
    run: async (use) => {
      // keepMine, then an update on another field: still closed.
      await withForm(use, (form) => {
        editBoth(form);
        rebase(form, server({ name: 'Theirs', city: 'Rome' }));
        act(() => form.current().rebase.keepMine('name'));
        rebase(form, server({ name: 'Theirs', city: 'Rome', amount: 20 }));
        expect(open(form)).toEqual([['supplier.city', 'Turin', 'Milan', 'Rome']]);
      });
      // keepMine, then an update that changes that field again to another value: open again, against it.
      await withForm(use, (form) => {
        act(() => form.current().editName('Mine'));
        rebase(form, server({ name: 'Theirs' }));
        act(() => form.current().rebase.keepMine('name'));
        rebase(form, server({ name: 'Theirs 2' }));
        expect(open(form)).toEqual([['name', 'Theirs', 'Mine', 'Theirs 2']]);
      });
      // acceptTheirs, then an update on another field: the field holds the server value, no conflict.
      await withForm(use, (form) => {
        editBoth(form);
        rebase(form, server({ name: 'Theirs', city: 'Rome' }));
        act(() => form.current().rebase.acceptTheirs('name'));
        rebase(form, server({ name: 'Theirs', city: 'Rome', amount: 20 }));
        expect(open(form)).toEqual([['supplier.city', 'Turin', 'Milan', 'Rome']]);
        expect(form.current().binding.values.name).toBe('Theirs');
      });
    },
  },
  {
    name: 'the same update again (a new object, the same content): no new conflict, no duplicate, applied of the last one',
    run: (use) =>
      withForm(use, (form) => {
        act(() => form.current().editName('Mine'));
        rebase(form, server({ name: 'Theirs', amount: 20 }));
        expect(form.current().rebase.applied.map((entry) => entry.path)).toEqual(['amount']);
        const before = form.current().rebase.conflicts;
        rebase(form, server({ name: 'Theirs', amount: 20 }));
        rebase(form, server({ name: 'Theirs', amount: 20 }));
        expect(form.current().rebase.conflicts).toEqual(before);
        // The last update changed nothing the user had not seen: nothing applied by it.
        expect(form.current().rebase.applied).toEqual([]);
      }),
  },
  {
    name: 'a successful save clears the accumulated conflicts; a failed one keeps them and the update queued meanwhile adds its own',
    run: async (use) => {
      await withForm(use, async (form) => {
        editBoth(form);
        rebase(form, server({ name: 'Theirs' }));
        rebase(form, server({ name: 'Theirs', city: 'Rome' }));
        expect(form.current().rebase.conflicts).toHaveLength(2);
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave();
        });
        await act(() => save.settle(null));
        expect(form.current().rebase.conflicts).toEqual([]);
        expect(form.current().rebase.applied).toEqual([]);
      });
      await withForm(use, async (form) => {
        editBoth(form);
        rebase(form, server({ name: 'Theirs' }));
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave();
        });
        rebase(form, server({ name: 'Theirs', city: 'Rome' }));
        expect(form.current().rebase.isPending).toBe(true);
        await act(() => save.settle(new Error('offline')));
        expect(form.current().rebase.isPending).toBe(false);
        expect(open(form)).toEqual([
          ['name', 'Acme', 'Mine', 'Theirs'],
          ['supplier.city', 'Turin', 'Milan', 'Rome'],
        ]);
      });
    },
  },
  {
    name: 'a successful save with an update queued: the update is merged with no earlier conflict, even on a field edited during the save',
    run: (use) =>
      withForm(use, async (form) => {
        act(() => form.current().editName('Mine'));
        rebase(form, server({ name: 'Theirs' }));
        expect(form.current().rebase.conflicts).toHaveLength(1);
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave((sent) => ({ ...sent, supplier: { ...sent.supplier, tags: [...sent.supplier.tags] } }));
        });
        // The server stores "Mine", then another user changes the amount only; the user edits the name again meanwhile.
        rebase(form, server({ name: 'Mine', amount: 20 }));
        act(() => form.current().editName('Mine 2'));
        await act(() => save.settle(null));
        expect(form.current().rebase.conflicts).toEqual([]);
        expect(form.current().rebase.applied.map((entry) => entry.path)).toEqual(['amount']);
        expect(form.current().binding.values).toEqual({ ...server({ amount: 20 }), name: 'Mine 2' });
      }),
  },
  {
    name: "the form's own discard, reset() and reset(newBaseline) clear the accumulated conflicts and applied",
    run: async (use) => {
      for (const clear of ['discard', 'reset()', 'reset(newBaseline)'] as const) {
        await withForm(use, (form) => {
          editBoth(form);
          rebase(form, server({ name: 'Theirs' }));
          rebase(form, server({ name: 'Theirs', city: 'Rome', amount: 20 }));
          expect(form.current().rebase.conflicts).toHaveLength(2);
          act(() => {
            if (clear === 'discard') form.current().discard();
            else if (clear === 'reset()') form.current().binding.reset();
            else form.current().binding.reset(server({ name: 'Reloaded' }));
          });
          expect(form.current().rebase.conflicts).toEqual([]);
          expect(form.current().rebase.applied).toEqual([]);
          // A later update starts from nothing: the old conflicts do not come back, even on fields edited again.
          editBoth(form);
          const { baseline } = form.current().binding;
          rebase(form, { ...baseline, amount: 30 });
          expect(form.current().rebase.conflicts).toEqual([]);
          expect(form.current().rebase.applied.map((entry) => entry.path)).toEqual(['amount']);
        });
      }
    },
  },
];
