// A consumer of @formrail/pro/engine with React Hook Form and no @formrail/core: typechecked by
// `no-core.test.ts` in a sandbox where @formrail/core is not installed (`skipLibCheck: false`, so a declaration
// file of the package naming the core would fail here).
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  computeChangeSummary,
  computeRebase,
  formatChangeValue,
  inferSegmentLabel,
  useChangeSummary,
  useFormRebase,
  type ChangeEntry,
  type OpenRebaseConflict,
  type RebaseFormBinding,
  type RebaseResult,
  type UseChangeSummaryReturn,
  type UseFormRebaseReturn,
} from '@formrail/pro/engine';

export interface Invoice {
  number: string;
  amount: number;
  notes: string;
  lines: { id: string; qty: number }[];
}

/** A Change Summary of a React Hook Form form against the baseline the app loaded. */
export function InvoiceForm({ baseline }: { baseline: Invoice }) {
  const form = useForm<Invoice>({ defaultValues: baseline });
  const values = form.watch();
  const summary: UseChangeSummaryReturn = useChangeSummary({ values, baseline, arrayIdKeys: { lines: 'id' } });
  return (
    <form>
      <input {...form.register('notes')} />
      <ul>
        {summary.entries.map((entry: ChangeEntry) => (
          <li key={entry.path}>
            {entry.label}: {formatChangeValue(entry.after)}
          </li>
        ))}
      </ul>
    </form>
  );
}

/** Any form kept to the contract drives `useFormRebase` (here a plain state pair). */
export function useStateBinding(initial: Invoice): RebaseFormBinding<Invoice> {
  const [state, setState] = useState({ baseline: initial, values: initial });
  const reset = useCallback((next?: Invoice) => setState((s) => ({ baseline: next ?? s.baseline, values: next ?? s.baseline })), []);
  const setValues = useCallback((patch: Partial<Invoice>) => setState((s) => ({ ...s, values: { ...s.values, ...patch } })), []);
  return { ...state, isSaving: false, saveError: null, reset, setValues };
}

export function useInvoiceRebase(initial: Invoice): UseFormRebaseReturn<Invoice> {
  return useFormRebase(useStateBinding(initial), { arrayIdKeys: { lines: 'id' } });
}

export const merge = (baseline: Invoice, values: Invoice, incoming: Invoice): RebaseResult<Invoice> =>
  computeRebase({ baseline, values, incoming, arrayIdKeys: { lines: 'id' } });

/** The open conflicts of the hook, with their current position. */
export type InvoiceConflict = OpenRebaseConflict;

export const labels = (baseline: Invoice, values: Invoice): string[] =>
  computeChangeSummary({ baseline, values }).map((entry) => entry.label).concat(inferSegmentLabel('vatNumber'));
