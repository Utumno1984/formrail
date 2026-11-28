// `useFormRebase` of the main entry `@formrail/pro` with its `options` (#489, code review round 1): a wrapper typed for
// core's form around the engine hook, so dropping `options` on the way would break `arrayIdKeys`, `isEqual` and
// `labels` for every consumer of the main entry. Shared by `public-api.test.tsx` (sources) and
// `dist.main-rebase.test.tsx` (built files, ESM and CJS), each with its own `useObjectPageForm`.
import { act, renderHook } from '@testing-library/react';
import type { UseObjectPageFormReturn } from '@formrail/core';
import type { RebaseFormBinding, UseFormRebaseOptions, UseFormRebaseReturn } from '../src/index';

type Line = { id: number; qty: number };
export type OptionsInvoice = { code: string; notes: string; lines: Line[] };

export const OPTIONS_BASE: OptionsInvoice = {
  code: 'inv-1',
  notes: '',
  lines: [
    { id: 1, qty: 1 },
    { id: 2, qty: 1 },
    { id: 3, qty: 1 },
  ],
};

/** Every option with an effect the scenario observes. */
export const SCENARIO_OPTIONS: UseFormRebaseOptions<OptionsInvoice> = {
  // Lines matched by id: the user's edit on item 2 and the server's on item 3 merge (a block would conflict).
  arrayIdKeys: { lines: 'id' },
  // Case-insensitive code: 'INV-2' (user) and 'inv-2' (server) are the same value, so no conflict.
  isEqual: (a, b, path) => (path === 'code' && typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : undefined),
  labels: { notes: 'Remarks' },
};

type UseObjectPageForm = (options: { baseline: OptionsInvoice }) => UseObjectPageFormReturn<OptionsInvoice>;
type UseMainFormRebase = (
  form: UseObjectPageFormReturn<OptionsInvoice>,
  options?: UseFormRebaseOptions<OptionsInvoice>,
) => UseFormRebaseReturn<OptionsInvoice>;

/**
 * The user edits the code, the notes and line 2; the server changes the code (same value but for the case), the
 * notes and line 3. Returns the conflicts (path and label) and the values after the rebase.
 */
export function runOptionsScenario(useObjectPageForm: UseObjectPageForm, useFormRebase: UseMainFormRebase, options?: UseFormRebaseOptions<OptionsInvoice>) {
  const view = renderHook(() => {
    const form = useObjectPageForm({ baseline: OPTIONS_BASE });
    return { form, rebase: useFormRebase(form, options) };
  });
  const current = () => view.result.current;
  act(() => {
    current().form.setValue('code', 'INV-2');
    current().form.setValue('notes', 'mine');
    current().form.setValue('lines', [
      { id: 1, qty: 1 },
      { id: 2, qty: 5 },
      { id: 3, qty: 1 },
    ]);
  });
  act(() =>
    current().rebase.rebase({
      code: 'inv-2',
      notes: 'theirs',
      lines: [
        { id: 1, qty: 1 },
        { id: 2, qty: 1 },
        { id: 3, qty: 7 },
      ],
    }),
  );
  const result = {
    conflicts: current()
      .rebase.conflicts.map((conflict) => [conflict.path, conflict.label])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
    values: current().form.values,
  };
  view.unmount();
  return result;
}

/** With `SCENARIO_OPTIONS`: only the notes conflict, under its label; both line edits kept. */
export const EXPECTED_WITH_OPTIONS = {
  conflicts: [['notes', 'Remarks']],
  values: {
    code: 'INV-2',
    notes: 'mine',
    lines: [
      { id: 1, qty: 1 },
      { id: 2, qty: 5 },
      { id: 3, qty: 7 },
    ],
  },
};

/** The same scenario with no options (the control: each option above changes this result). */
export const EXPECTED_WITHOUT_OPTIONS = {
  conflicts: [
    ['code', 'Code'],
    ['lines', 'Lines'],
    ['notes', 'Notes'],
  ],
  values: { code: 'INV-2', notes: 'mine', lines: [{ id: 1, qty: 1 }, { id: 2, qty: 5 }, { id: 3, qty: 1 }] },
};

type UseBindingFormRebase = (
  form: RebaseFormBinding<OptionsInvoice>,
  options?: UseFormRebaseOptions<OptionsInvoice>,
) => UseFormRebaseReturn<OptionsInvoice>;

/**
 * The same scenario, with the options changed by a rerender between the edits and the rebase (#507, red team of
 * #505 round 3): the hook renders with `first`, the user edits, the hook renders again with `second` (a new object,
 * as an inline literal is), then the server version arrives. The merge must use `second`: the options are read when
 * the rebase is applied, not frozen at the first render. Takes the hook of the main entry (core's form) or of the
 * engine entry (any binding; core's form is one).
 */
export function runOptionsRerenderScenario(
  useObjectPageForm: UseObjectPageForm,
  useFormRebase: UseMainFormRebase | UseBindingFormRebase,
  first: UseFormRebaseOptions<OptionsInvoice> | undefined,
  second: UseFormRebaseOptions<OptionsInvoice> | undefined,
) {
  const view = renderHook(
    ({ options }: { options: UseFormRebaseOptions<OptionsInvoice> | undefined }) => {
      const form = useObjectPageForm({ baseline: OPTIONS_BASE });
      return { form, rebase: (useFormRebase as UseMainFormRebase)(form, options) };
    },
    { initialProps: { options: first } },
  );
  const current = () => view.result.current;
  act(() => {
    current().form.setValue('code', 'INV-2');
    current().form.setValue('notes', 'mine');
    current().form.setValue('lines', [
      { id: 1, qty: 1 },
      { id: 2, qty: 5 },
      { id: 3, qty: 1 },
    ]);
  });
  view.rerender({ options: second === undefined ? undefined : { ...second } });
  act(() =>
    current().rebase.rebase({
      code: 'inv-2',
      notes: 'theirs',
      lines: [
        { id: 1, qty: 1 },
        { id: 2, qty: 1 },
        { id: 3, qty: 7 },
      ],
    }),
  );
  const result = {
    conflicts: current()
      .rebase.conflicts.map((conflict) => [conflict.path, conflict.label])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
    values: current().form.values,
  };
  view.unmount();
  return result;
}

/** Options that differ from `SCENARIO_OPTIONS` in every key: other labels, no `isEqual`, no `arrayIdKeys`. */
export const OTHER_LABELS: UseFormRebaseOptions<OptionsInvoice> = { labels: { notes: 'Memo', code: 'Invoice code', lines: 'Rows' } };

/** With `OTHER_LABELS`: the conflicts of the scenario without options, under the other labels. */
export const EXPECTED_WITH_OTHER_LABELS = {
  conflicts: [
    ['code', 'Invoice code'],
    ['lines', 'Rows'],
    ['notes', 'Memo'],
  ],
  values: EXPECTED_WITHOUT_OPTIONS.values,
};
