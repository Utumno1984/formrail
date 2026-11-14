// Public API of @formrail/pro (ticket #489): the main entry `.` keeps every name it exported before the engine
// entry existed (a superset), `useFormRebase` still takes core's form without a cast, and the engine entry
// `@formrail/pro/engine` drives a form that is not core's through `RebaseFormBinding`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useCallback, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useObjectPageForm, type UseObjectPageFormReturn } from '@formrail/core';
import * as main from '../src/index';
import * as engine from '../src/engine';
// Every type name of the main entry before #489: one of them removed or renamed fails the typecheck.
import type {
  ChangeEntry,
  ChangeKind,
  ChangeSummaryOptions,
  ChangeSummaryProps,
  ChangeSummaryValueLabels,
  FormatChangeValueOptions,
  OpenRebaseConflict,
  RebaseConflict,
  RebaseNoticeLabels,
  RebaseNoticeProps,
  RebaseOptions,
  RebaseResult,
  UseChangeSummaryReturn,
  UseFormRebaseOptions,
  UseFormRebaseReturn,
  VirtualListReportLabels,
  VirtualListReportProps,
  VirtualListReportTableHandle,
  VirtualListReportTableProps,
} from '../src/index';
import type { RebaseFormBinding } from '../src/engine';

// Vitest runs in packages/pro (jsdom: `import.meta.url` is not a file URL here).
const SRC = resolve(process.cwd(), 'src');

/** Runtime names of `src/index.ts` on main 45f2a59, before the engine entry (#489). */
const MAIN_EXPORTS_BEFORE_489 = [
  'ChangeSummary',
  'RebaseNotice',
  'VirtualListReport',
  'VirtualListReportTable',
  'computeChangeSummary',
  'computeRebase',
  'formatChangeValue',
  'inferSegmentLabel',
  'useChangeSummary',
  'useFormRebase',
];

type TypesStillExported = [
  ChangeEntry,
  ChangeKind,
  ChangeSummaryOptions<object>,
  ChangeSummaryProps,
  ChangeSummaryValueLabels,
  FormatChangeValueOptions,
  OpenRebaseConflict,
  RebaseConflict,
  RebaseNoticeLabels,
  RebaseNoticeProps,
  RebaseOptions<object>,
  RebaseResult<object>,
  UseChangeSummaryReturn,
  UseFormRebaseOptions<object>,
  UseFormRebaseReturn<object>,
  VirtualListReportLabels,
  VirtualListReportProps<object>,
  VirtualListReportTableHandle,
  VirtualListReportTableProps<object>,
];

describe('main entry @formrail/pro', () => {
  it('exports a superset of the names it exported before the engine entry', () => {
    expect(Object.keys(main)).toEqual(expect.arrayContaining(MAIN_EXPORTS_BEFORE_489));
    // The type names: checked by the typecheck of the `import type` above.
    expectTypeOf<TypesStillExported>().not.toBeNever();
  });

  it('re-exports every engine under the same name and identity, except useFormRebase (typed for core)', () => {
    for (const [name, value] of Object.entries(engine)) {
      if (name === 'useFormRebase') expect(typeof main.useFormRebase).toBe('function');
      else expect(main[name as keyof typeof main]).toBe(value);
    }
  });

  it('useFormRebase of the main entry keeps the signature it had (core form), the engine one takes a binding', () => {
    expectTypeOf(main.useFormRebase<Invoice>).parameter(0).toEqualTypeOf<UseObjectPageFormReturn<Invoice>>();
    expectTypeOf(engine.useFormRebase<Invoice>).parameter(0).toEqualTypeOf<RebaseFormBinding<Invoice>>();
  });

  it('the TSDoc of the two useFormRebase is the same text', () => {
    const doc = (file: string) => {
      const source = readFileSync(resolve(SRC, 'form-rebase', file), 'utf8');
      const end = source.indexOf('*/\nexport function useFormRebase');
      return end < 0 ? undefined : source.slice(source.lastIndexOf('/**', end), end + 2);
    };
    expect(doc('use-form-rebase.ts')).toMatch(/^\/\*\*\n \* Applies the merge/);
    expect(doc('use-form-rebase-core.ts')).toBe(doc('use-form-rebase.ts'));
  });

  it('useFormRebase takes the form of useObjectPageForm as is (no cast)', () => {
    const { result } = renderHook(() => {
      const form: UseObjectPageFormReturn<{ name: string }> = useObjectPageForm({ baseline: { name: 'Acme' } });
      return { form, rebase: main.useFormRebase(form) };
    });
    expectTypeOf(result.current.rebase).toEqualTypeOf<UseFormRebaseReturn<{ name: string }>>();
    expectTypeOf<UseObjectPageFormReturn<{ name: string }>>().toMatchTypeOf<RebaseFormBinding<{ name: string }>>();
    act(() => result.current.rebase.rebase({ name: 'Acme Inc' }));
    expect(result.current.form.values).toEqual({ name: 'Acme Inc' });
    expect(result.current.form.isDirty).toBe(false);
  });
});

type Invoice = { number: string; amount: number; notes: string };
const BASE: Invoice = { number: 'A-1', amount: 10, notes: '' };

/**
 * A form that is not core's: a plain `useState` pair kept to the `RebaseFormBinding` contract (snapshots,
 * `reset(b)` makes both sides `b`, `setValues` merges on top in the same batch).
 */
function useStateForm(initial: Invoice): RebaseFormBinding<Invoice> & { edit: (patch: Partial<Invoice>) => void } {
  const [state, setState] = useState({ baseline: initial, values: initial });
  const reset = useCallback((next?: Invoice) => setState((s) => ({ baseline: next ?? s.baseline, values: next ?? s.baseline })), []);
  const setValues = useCallback((patch: Partial<Invoice>) => setState((s) => ({ ...s, values: { ...s.values, ...patch } })), []);
  return { ...state, isSaving: false, saveError: null, reset, setValues, edit: setValues };
}

describe('@formrail/pro/engine: useFormRebase on a form that is not core', () => {
  function setup() {
    const renders: { values: Invoice; baseline: Invoice }[] = [];
    const view = renderHook(() => {
      const form = useStateForm(BASE);
      const rebase = engine.useFormRebase(form);
      const summary = engine.useChangeSummary({ values: form.values, baseline: form.baseline });
      renders.push({ values: form.values, baseline: form.baseline });
      return { form, rebase, summary };
    });
    return { current: () => view.result.current, renders };
  }

  it('applies the server change to an untouched field and keeps the user edit, no render with values === incoming', () => {
    const { current, renders } = setup();
    act(() => current().form.edit({ notes: 'mine' }));
    const incoming = { ...BASE, amount: 20 };
    renders.length = 0;
    act(() => current().rebase.rebase(incoming));
    expect(current().form.baseline).toBe(incoming);
    expect(current().form.values).toEqual({ number: 'A-1', amount: 20, notes: 'mine' });
    expect(renders.some((r) => r.values === incoming)).toBe(false);
    expect(current().rebase.applied.map((e) => e.path)).toEqual(['amount']);
    expect(current().summary.entries.map((e) => e.path)).toEqual(['notes']);
  });

  it('a conflict keeps the user value; keepMine closes it and the edit stays', () => {
    const { current } = setup();
    act(() => current().form.edit({ amount: 15 }));
    act(() => current().rebase.rebase({ ...BASE, amount: 30 }));
    expect(current().rebase.conflicts.map((c) => [c.path, c.mine, c.theirs])).toEqual([['amount', 15, 30]]);
    expect(current().form.values.amount).toBe(15);
    act(() => current().rebase.keepMine('amount'));
    expect(current().rebase.conflicts).toEqual([]);
    expect(current().summary.entries.map((e) => [e.path, e.before, e.after])).toEqual([['amount', 30, 15]]);
  });

  it('acceptTheirs takes the server value and the summary is empty', () => {
    const { current } = setup();
    act(() => current().form.edit({ amount: 15 }));
    act(() => current().rebase.rebase({ ...BASE, amount: 30 }));
    act(() => current().rebase.acceptTheirs('amount'));
    expect(current().form.values.amount).toBe(30);
    expect(current().rebase.conflicts).toEqual([]);
    expect(current().summary.isEmpty).toBe(true);
  });
});
