// The documented rules of `RebaseFormBinding` (packages/pro/src/form-rebase/types.ts) as a suite shared by every
// binding (ticket #507, reused by #508): core's `useObjectPageForm` as the reference, the React Hook Form adapter,
// the TanStack Form adapter. Each check is a plain async function, so a test can also run it against a binding
// that breaks a rule and expect it to fail (the suite is not blind).
import { act, renderHook } from '@testing-library/react';
import { expect } from 'vitest';
import { useFormRebase, type RebaseFormBinding, type UseFormRebaseReturn } from '../src/engine';

export interface ContractInvoice {
  name: string;
  amount: number;
  supplier: { city: string; tags: string[] };
}

export const CONTRACT_INITIAL: ContractInvoice = { name: 'Acme', amount: 10, supplier: { city: 'Turin', tags: ['a'] } };

/** What a test drives on the form under test: user edits and a save it settles by hand. */
export interface ContractForm {
  binding: RebaseFormBinding<ContractInvoice>;
  /** A user edit of a top-level field. */
  editName: (name: string) => void;
  /** A user edit of a nested field (the libraries that mutate their values in place do it here). */
  editCity: (city: string) => void;
  /**
   * Starts a save through the form's own mechanism, in its documented pattern; `settle(null)` makes it succeed,
   * `settle(error)` fail. `respond`, when given, is the server: it receives the values sent and returns the
   * record it stored (a normalization), which the save makes the new baseline.
   */
  startSave: (respond?: (sent: ContractInvoice) => ContractInvoice) => { settle: (error: unknown) => Promise<void> };
  /**
   * A validation error appears on a field while the user edits, the way the library validates as the user types
   * (a form without live validation, as core's, validates only on save: nothing to do).
   */
  showValidationError: () => void;
  /**
   * The form's own discard, the way an app's Discard button calls it, outside the binding (React Hook Form:
   * `form.reset()`, which also sets `submitCount` back to 0).
   */
  discard: () => void;
}

/** A hook that renders the form under test, initialized with `initial`. */
export type UseContractForm = (initial: ContractInvoice) => ContractForm;

/** Renders `use` (with the rebase engine on its binding) and records the binding of every render. */
function mount(use: UseContractForm) {
  const renders: RebaseFormBinding<ContractInvoice>[] = [];
  const view = renderHook(() => {
    const form = use(CONTRACT_INITIAL);
    renders.push(form.binding);
    return { ...form, rebase: useFormRebase(form.binding) as UseFormRebaseReturn<ContractInvoice> };
  });
  return { current: () => view.result.current, renders, rerender: () => view.rerender(), unmount: () => view.unmount() };
}

type Mounted = ReturnType<typeof mount>;

/** Runs `body` on a fresh mount of `use`, unmounting it whatever happens. */
async function withForm(use: UseContractForm, body: (form: Mounted) => void | Promise<void>): Promise<void> {
  const form = mount(use);
  try {
    await body(form);
  } finally {
    form.unmount();
  }
}

/** A deep copy that keeps the content, for comparison after the fact. */
const copy = <T>(value: T): T => structuredClone(value);

export interface ContractCheck {
  name: string;
  run: (use: UseContractForm) => Promise<void>;
}

export const CONTRACT_CHECKS: ContractCheck[] = [
  {
    name: 'snapshots are never mutated in place (edits, reset, setValues)',
    run: (use) =>
      withForm(use, (form) => {
        const seen: { object: object; content: unknown }[] = [];
        const keep = () => {
          const { values, baseline } = form.current().binding;
          seen.push({ object: values, content: copy(values) }, { object: baseline, content: copy(baseline) });
        };
        keep();
        act(() => form.current().editCity('Milan'));
        keep();
        act(() => form.current().editName('Acme Ltd'));
        keep();
        act(() => form.current().binding.reset({ ...CONTRACT_INITIAL, amount: 20, supplier: { city: 'Rome', tags: ['b'] } }));
        keep();
        act(() => form.current().editCity('Naples'));
        act(() => form.current().binding.setValues({ amount: 30 }));
        keep();
        act(() => form.current().editCity('Genoa'));
        for (const { object, content } of seen) expect(object).toEqual(content);
      }),
  },
  {
    name: 'values is a new object when the content changes, the same object across renders that change nothing',
    run: (use) =>
      withForm(use, (form) => {
        const before = form.current().binding;
        form.rerender();
        form.rerender();
        expect(form.current().binding.values).toBe(before.values);
        expect(form.current().binding.baseline).toBe(before.baseline);
        act(() => form.current().editCity('Milan'));
        const edited = form.current().binding.values;
        expect(edited).not.toBe(before.values);
        expect(edited.supplier.city).toBe('Milan');
        expect(before.values.supplier.city).toBe('Turin');
        form.rerender();
        expect(form.current().binding.values).toBe(edited);
        expect(form.current().binding.baseline).toBe(before.baseline);
      }),
  },
  {
    name: 'reset(b) makes baseline and values the object b itself, from the next render',
    run: (use) =>
      withForm(use, (form) => {
        act(() => form.current().editName('Acme Ltd'));
        const next = { ...CONTRACT_INITIAL, amount: 99 };
        act(() => form.current().binding.reset(next));
        expect(form.current().binding.baseline).toBe(next);
        expect(form.current().binding.values).toBe(next);
        form.rerender();
        expect(form.current().binding.baseline).toBe(next);
        expect(form.current().binding.values).toBe(next);
      }),
  },
  {
    name: 'reset() makes values the current baseline object',
    run: (use) =>
      withForm(use, (form) => {
        act(() => form.current().editCity('Milan'));
        act(() => form.current().editName('Acme Ltd'));
        const { baseline } = form.current().binding;
        act(() => form.current().binding.reset());
        expect(form.current().binding.values).toBe(baseline);
        expect(form.current().binding.baseline).toBe(baseline);
      }),
  },
  {
    name: 'values brought back to the baseline by hand are another object (only a reset hands back the baseline)',
    run: (use) =>
      withForm(use, (form) => {
        const { baseline } = form.current().binding;
        act(() => form.current().editName('Acme Ltd'));
        act(() => form.current().editName('Acme'));
        expect(form.current().binding.values).not.toBe(baseline);
        expect(form.current().binding.values).toEqual(baseline);
      }),
  },
  {
    name: 'setValues(patch) right after reset(b) in the same batch applies on top of it, with no render of the reset alone',
    run: (use) =>
      withForm(use, (form) => {
        act(() => form.current().editCity('Milan'));
        const next = { ...CONTRACT_INITIAL, amount: 50 };
        const from = form.renders.length;
        act(() => {
          form.current().binding.reset(next);
          form.current().binding.setValues({ name: 'Mine', supplier: { city: 'Milan', tags: ['a'] } });
        });
        const after = form.renders.slice(from);
        expect(after.length).toBeGreaterThan(0);
        expect(after.some((binding) => binding.values === next || binding.values.name !== 'Mine')).toBe(false);
        expect(form.current().binding.baseline).toBe(next);
        expect(form.current().binding.values).not.toBe(next);
        expect(form.current().binding.values).toEqual({ name: 'Mine', amount: 50, supplier: { city: 'Milan', tags: ['a'] } });
      }),
  },
  {
    name: 'setValues merges the top-level keys of the patch (shallow), the other keys stay',
    run: (use) =>
      withForm(use, (form) => {
        act(() => form.current().editCity('Milan'));
        act(() => form.current().binding.setValues({ amount: 42 }));
        expect(form.current().binding.values).toEqual({ name: 'Acme', amount: 42, supplier: { city: 'Milan', tags: ['a'] } });
        expect(form.current().binding.baseline).toEqual(CONTRACT_INITIAL);
      }),
  },
  {
    name: 'isSaving is true while a save is in flight; saveError is null after a save that succeeds, not null after one that fails',
    run: (use) =>
      withForm(use, async (form) => {
        expect(form.current().binding.isSaving).toBe(false);
        act(() => form.current().editName('Acme Ltd'));
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave();
        });
        expect(form.current().binding.isSaving).toBe(true);
        await act(() => save.settle(new Error('offline')));
        expect(form.current().binding.isSaving).toBe(false);
        expect(form.current().binding.saveError).not.toBeNull();
        await act(async () => {
          save = form.current().startSave();
        });
        expect(form.current().binding.isSaving).toBe(true);
        await act(() => save.settle(null));
        expect(form.current().binding.isSaving).toBe(false);
        expect(form.current().binding.saveError).toBeNull();
      }),
  },
  {
    name: 'a save with no edit meanwhile: values and baseline become what the server stored (normalized), the form is clean',
    run: (use) =>
      withForm(use, async (form) => {
        act(() => form.current().editName('  acme ltd '));
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave((sent) => ({ ...sent, name: 'Acme Ltd' }));
        });
        await act(() => save.settle(null));
        const stored = { ...CONTRACT_INITIAL, name: 'Acme Ltd' };
        expect(form.current().binding.baseline).toEqual(stored);
        expect(form.current().binding.values).toEqual(stored);
      }),
  },
  {
    name: 'a field edited while saving keeps the typed value and stays dirty against the new baseline',
    run: (use) =>
      withForm(use, async (form) => {
        act(() => form.current().editName('Acme Ltd'));
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave((sent) => copy(sent));
        });
        act(() => form.current().editCity('Milan'));
        await act(() => save.settle(null));
        expect(form.current().binding.baseline).toEqual({ ...CONTRACT_INITIAL, name: 'Acme Ltd' });
        expect(form.current().binding.values).toEqual({ ...CONTRACT_INITIAL, name: 'Acme Ltd', supplier: { city: 'Milan', tags: ['a'] } });
      }),
  },
  {
    name: 'a field the server normalized and the user edited while saving keeps the typed value',
    run: (use) =>
      withForm(use, async (form) => {
        act(() => form.current().editName('acme ltd'));
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave((sent) => ({ ...sent, name: 'Acme Ltd' }));
        });
        act(() => form.current().editName('acme ltd co'));
        await act(() => save.settle(null));
        expect(form.current().binding.baseline).toEqual({ ...CONTRACT_INITIAL, name: 'Acme Ltd' });
        expect(form.current().binding.values).toEqual({ ...CONTRACT_INITIAL, name: 'acme ltd co' });
      }),
  },
  {
    name: 'a validation error that appears during a save the server stores does not make saveError non-null',
    run: (use) =>
      withForm(use, async (form) => {
        act(() => form.current().editName('Acme Ltd'));
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave((sent) => copy(sent));
        });
        act(() => form.current().editCity('Milan'));
        act(() => form.current().showValidationError());
        await act(() => save.settle(null));
        expect(form.current().binding.isSaving).toBe(false);
        expect(form.current().binding.saveError).toBeNull();
        expect(form.current().binding.baseline).toEqual({ ...CONTRACT_INITIAL, name: 'Acme Ltd' });
      }),
  },
  {
    name: 'after a save that succeeds and a discard of the form, the next save that fails has a non-null saveError',
    run: (use) =>
      withForm(use, async (form) => {
        act(() => form.current().editName('Acme Ltd'));
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave((sent) => copy(sent));
        });
        await act(() => save.settle(null));
        expect(form.current().binding.saveError).toBeNull();
        act(() => form.current().discard());
        act(() => form.current().editName('Acme Co'));
        await act(async () => {
          save = form.current().startSave((sent) => copy(sent));
        });
        expect(form.current().binding.isSaving).toBe(true);
        await act(() => save.settle(new Error('500 from server')));
        expect(form.current().binding.isSaving).toBe(false);
        expect(form.current().binding.saveError).not.toBeNull();
        // Nothing saved: the edit is still there, against the record of the first save.
        expect(form.current().binding.values).toEqual({ ...CONTRACT_INITIAL, name: 'Acme Co' });
        expect(form.current().binding.baseline).toEqual({ ...CONTRACT_INITIAL, name: 'Acme Ltd' });
      }),
  },
  {
    name: 'setValues during a save keeps the save in flight; an edit made after it survives the save',
    run: (use) =>
      withForm(use, async (form) => {
        act(() => form.current().editName('Acme Ltd'));
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave((sent) => copy(sent));
        });
        // Back to the baseline by code, then a user edit on another field.
        act(() => form.current().binding.setValues({ name: 'Acme' }));
        expect(form.current().binding.isSaving).toBe(true);
        act(() => form.current().editCity('Milan'));
        expect(form.current().binding.isSaving).toBe(true);
        await act(() => save.settle(null));
        expect(form.current().binding.isSaving).toBe(false);
        expect(form.current().binding.baseline).toEqual({ ...CONTRACT_INITIAL, name: 'Acme Ltd' });
        expect(form.current().binding.values).toEqual({ ...CONTRACT_INITIAL, supplier: { city: 'Milan', tags: ['a'] } });
      }),
  },
  {
    name: 'acceptTheirs during a save keeps the save in flight, the accepted value and an edit made after it',
    run: (use) =>
      withForm(use, async (form) => {
        act(() => form.current().editName('Mine'));
        act(() => form.current().rebase.rebase({ ...CONTRACT_INITIAL, name: 'Theirs', amount: 11 }));
        expect(form.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['name']);
        let save!: { settle: (error: unknown) => Promise<void> };
        await act(async () => {
          save = form.current().startSave((sent) => copy(sent));
        });
        act(() => form.current().rebase.acceptTheirs('name'));
        expect(form.current().binding.isSaving).toBe(true);
        act(() => form.current().editCity('Milan'));
        await act(() => save.settle(null));
        expect(form.current().binding.isSaving).toBe(false);
        // Saved: what was sent ("Mine"); kept: the accepted server value and the edit made during the save.
        expect(form.current().binding.baseline).toEqual({ ...CONTRACT_INITIAL, name: 'Mine', amount: 11 });
        expect(form.current().binding.values).toEqual({ name: 'Theirs', amount: 11, supplier: { city: 'Milan', tags: ['a'] } });
      }),
  },
];

/** A deferred promise: the save of `startSave` waits for it. */
export function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
