// Story-only (ticket #508): the demo of `Pro/Integrations/TanStack Form`, in its own module so a unit test renders the
// same component as the story (the stories file needs Storybook's Vite build). Not reached by any package entry.
import { useEffect, useRef, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase } from '../../engine';
import { useTanStackFormBinding } from './use-tanstack-form-binding';

export interface DemoArgs {
  /** Duration of the simulated save, in milliseconds. */
  saveDelay: number;
  /** Delay before the record arrives, in milliseconds (`0`: the form mounts already hydrated). */
  hydrationDelay: number;
  /** Wired to Actions: called with the values sent by "Save". */
  onSave: (values: unknown) => void;
  /** Wired to Actions: called with the incoming version when "Simulate server update" is pressed. */
  onServerUpdate: (incoming: unknown) => void;
}

export interface Invoice {
  supplier: string;
  amount: string;
  notes: string;
}

export const RECORD: Invoice = { supplier: 'Lumen Parts', amount: '100', notes: '' };
/** The empty form shown while the record loads: one default per field. */
const EMPTY: Invoice = { supplier: '', amount: '', notes: '' };

const FIELDS: { name: keyof Invoice; label: string }[] = [
  { name: 'supplier', label: 'Supplier' },
  { name: 'amount', label: 'Amount' },
  { name: 'notes', label: 'Notes' },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function TanStackFormDemo({ saveDelay, hydrationDelay, onSave, onServerUpdate }: DemoArgs) {
  // The record as stored by the simulated server: a save writes it when the request starts.
  const server = useRef<Invoice>(RECORD);
  // The record as the server has it, `null` while it loads: the `defaultValues` of `useForm`.
  const [saved, setSaved] = useState<Invoice | null>(hydrationDelay > 0 ? null : RECORD);
  const form = useForm({
    defaultValues: saved ?? EMPTY,
    onSubmit: async ({ value }) => {
      server.current = value;
      await wait(saveDelay);
      onSave(value);
      // The stored record becomes the baseline inside `onSubmit`: a rebase queued meanwhile merges against it.
      binding.reset(value);
    },
  });
  const binding = useTanStackFormBinding(form);
  // Once loaded, `saved` follows the baseline: after a save (`binding.reset(value)`) and after a rebase, also one
  // queued until a save ends. So TanStack Form's own `isDefaultValue` and `form.reset()` agree with the summary.
  useEffect(() => setSaved((current) => (current === null ? null : binding.baseline)), [binding.baseline]);
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { rebase, conflicts, acceptTheirs, keepMine, isPending } = useFormRebase(binding);
  const loading = saved === null;

  // Asynchronous hydration: the record arrives after the mount, as the new `defaultValues` of `useForm`.
  useEffect(() => {
    if (hydrationDelay <= 0) return undefined;
    const timer = setTimeout(() => setSaved(server.current), hydrationDelay);
    return () => clearTimeout(timer);
  }, [hydrationDelay]);

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

  const status = loading ? 'Loading…' : isEmpty ? 'All saved' : 'Unsaved changes';

  return (
    // Inline styles: the pro stylesheet emits no utilities (only `.rop-pro-*` component classes).
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}
    >
      {FIELDS.map(({ name, label }) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {label}
              <input name={name} value={field.state.value} disabled={loading} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
            </label>
          )}
        </form.Field>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" disabled={loading || isEmpty || binding.isSaving}>
          {binding.isSaving ? 'Saving…' : 'Save'}
        </button>
        {/* The discard against the saved baseline (with `defaultValues` on it, TanStack Form's `form.reset()` agrees). */}
        <button type="button" disabled={loading} onClick={() => binding.reset()}>
          Discard
        </button>
        <button type="button" disabled={loading} onClick={simulateServerUpdate}>
          Simulate server update
        </button>
      </div>
      <p role="status" style={{ margin: 0 }}>
        {[status, isPending ? 'Server update queued until the save ends' : ''].filter(Boolean).join(' · ')}
      </p>
      <section aria-labelledby="tsf-summary">
        <h3 id="tsf-summary" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Summary
        </h3>
        {isEmpty ? (
          <p style={{ margin: 0 }}>No changes</p>
        ) : (
          <ul aria-label="Changes" style={{ margin: 0, paddingLeft: 16 }}>
            {entries.map((entry) => (
              <li key={entry.path}>{`${entry.label}: ${JSON.stringify(entry.before)} → ${JSON.stringify(entry.after)}`}</li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="tsf-conflicts">
        <h3 id="tsf-conflicts" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Conflicts ({conflicts.length})
        </h3>
        <ul aria-labelledby="tsf-conflicts" style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, paddingLeft: 16 }}>
          {conflicts.map((conflict) => (
            <li key={conflict.path} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span>{`${conflict.label}: yours ${JSON.stringify(conflict.mine)}, server ${JSON.stringify(conflict.theirs)}`}</span>
              <button type="button" onClick={() => acceptTheirs(conflict.path)}>{`Accept server value for ${conflict.label}`}</button>
              <button type="button" onClick={() => keepMine(conflict.path)}>{`Keep my value for ${conflict.label}`}</button>
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}
