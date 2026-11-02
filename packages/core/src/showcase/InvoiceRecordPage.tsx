// Story-only: the invoice detail page, composed ONLY from the public Object Page pieces. Not exported
// by the package. Spec §1.4: the editor is mounted already hydrated (`key` per record + `baseline` at
// mount); a fetch in flight is a loading state, never an editor that is hydrated afterwards.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { ValidationProvider } from '../field/ValidationContext';
import { Input } from '../input/Input';
import type { DemoInvoiceStatus } from '../internal/demo-invoices';
import { getErrorSummary } from '../object-page/error-summary';
import { ObjectPage } from '../object-page/ObjectPage';
import { ObjectPageFooter } from '../object-page/ObjectPageFooter';
import { ObjectPageHeader } from '../object-page/ObjectPageHeader';
import { ObjectPageSection } from '../object-page/ObjectPageSection';
import { useDirtyGuard } from '../object-page/use-dirty-guard';
import { useFocusFirstInvalidField } from '../object-page/use-focus-first-invalid-field';
import { useObjectPageForm } from '../object-page/use-object-page-form';
import { MessageStrip } from '../message-strip/MessageStrip';
import { Select } from '../select/Select';
import { StatusBadge } from '../status-badge/StatusBadge';
import { InvoiceNotFoundError, type InvoiceStore, type StoredInvoice } from './invoice-store';
import { STATUS_LABEL, STATUS_TONE, SUPPLIERS_EN } from './showcase-data';

export interface InvoiceRecordPageProps {
  store: InvoiceStore;
  recordId: string;
  /** Called by "Back to list" (after the dirty-guard confirmation when the form is dirty). */
  onBack: () => void;
  /** Called once per successful save with the record as the server stored it. */
  onSaved?: (invoice: StoredInvoice) => void;
}

interface InvoiceValues {
  supplier: string;
  status: DemoInvoiceStatus;
  /** Text, as typed; the server normalizes it to 2 decimals. */
  amount: string;
  date: string;
  dueDate: string;
  notes: string;
}

const toValues = (r: StoredInvoice): InvoiceValues => ({
  supplier: r.supplier,
  status: r.status,
  amount: r.amount.toFixed(2),
  date: r.date,
  dueDate: r.dueDate,
  notes: r.notes,
});

const toInvoice = (record: StoredInvoice, v: InvoiceValues): StoredInvoice => ({
  ...record,
  supplier: v.supplier,
  status: v.status,
  amount: Number(v.amount),
  date: v.date,
  dueDate: v.dueDate,
  notes: v.notes,
});

const SUPPLIER_OPTIONS = SUPPLIERS_EN.map((s) => ({ value: s, label: s }));
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as DemoInvoiceStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

const summaryText =(count: number) => (count === 1 ? '1 invalid field' : `${count} invalid fields`);
const errorText = (error: unknown): string | undefined =>
  error === null || error === undefined ? undefined : error instanceof Error ? error.message : String(error);

type LoadState = { key: string; record: StoredInvoice } | { key: string; error: unknown };

/** Loads the record, then mounts the editor. No editable field exists until the record has arrived. */
export function InvoiceRecordPage({ store, recordId, onBack, onSaved }: InvoiceRecordPageProps) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadState | null>(null);
  const key = `${recordId}#${attempt}`;

  useEffect(() => {
    // Tracks the last request: a response for a superseded id/attempt is dropped.
    let current = true;
    store.get(recordId).then(
      (record) => current && setResult({ key, record }),
      (error: unknown) => current && setResult({ key, error }),
    );
    return () => {
      current = false;
    };
  }, [store, recordId, key]);

  // A result that belongs to another request counts as "still loading": no stale editor is ever shown.
  const settled = result && result.key === key ? result : null;

  // One live region, always mounted: its text changes after mount, so the loading and the arrival of
  // the editor are announced (a region inserted already filled may be skipped by a screen reader).
  const announcement = !settled ? 'Loading invoice…' : 'record' in settled ? `Invoice ${settled.record.number} loaded` : '';
  const announcer = (
    <div role="status" style={VISUALLY_HIDDEN}>
      {announcement}
    </div>
  );

  if (!settled) {
    return (
      <>
        {announcer}
        <div style={{ padding: 16 }}>Loading invoice…</div>
      </>
    );
  }
  if ('error' in settled) {
    const notFound = settled.error instanceof InvoiceNotFoundError;
    return (
      <>
        {announcer}
      <div style={{ display: 'grid', gap: 12, padding: 16, maxWidth: 560 }}>
        <MessageStrip tone="error" title={notFound ? 'Invoice not found' : 'Could not load the invoice'}>
          {notFound ? `There is no invoice with id "${recordId}".` : (errorText(settled.error) ?? 'Unknown error')}
        </MessageStrip>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onBack}>Back to list</Button>
          {notFound ? null : (
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </Button>
          )}
        </div>
      </div>
      </>
    );
  }
  // `key`: a different record is a different editor, mounted hydrated, never a reset of the old one.
  return (
    <>
      {announcer}
      <InvoiceEditor
        key={settled.record.id}
        store={store}
        record={settled.record}
        onBack={onBack}
        onSaved={onSaved}
        focusTitleOnMount={attempt > 0}
      />
    </>
  );
}

interface InvoiceEditorProps {
  store: InvoiceStore;
  record: StoredInvoice;
  onBack: () => void;
  onSaved: ((invoice: StoredInvoice) => void) | undefined;
  /** After "Retry" the button that had the focus is gone: the title takes it (never `<body>`). */
  focusTitleOnMount: boolean;
}

// The amount is text; "1295.9" and "1295.90" are the same number, so typing the shorter form of the
// baseline is not a change.
const sameAmount = (a: string, b: string): boolean => a === b || (a.trim() !== '' && b.trim() !== '' && Number(a) === Number(b));
const sameValues = (a: InvoiceValues, b: InvoiceValues): boolean =>
  sameAmount(a.amount, b.amount) &&
  a.supplier === b.supplier &&
  a.status === b.status &&
  a.date === b.date &&
  a.dueDate === b.dueDate &&
  a.notes === b.notes;

const DECIMAL = /^\d+(\.\d+)?$/;

function InvoiceEditor({ store, record, onBack, onSaved, focusTitleOnMount }: InvoiceEditorProps) {
  const form = useObjectPageForm<InvoiceValues>({
    baseline: toValues(record),
    isEqual: sameValues,
    validate: (v) => {
      const errors: Partial<Record<keyof InvoiceValues, string>> = {};
      if (!v.supplier) errors.supplier = 'Supplier is required.';
      if (!DECIMAL.test(v.amount.trim()) || Number(v.amount) <= 0) {
        errors.amount = 'Amount must be greater than 0.';
      }
      return errors;
    },
  });
  const { guard, dialog } = useDirtyGuard({
    when: form.isDirty,
    labels: {
      title: 'Unsaved changes',
      description: 'You have unsaved changes: if you leave now they will be lost.',
      stay: 'Keep editing',
      leave: 'Discard changes',
      close: 'Close',
    },
  });
  const frameRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef: frameRef, fieldErrors: form.fieldErrors });
  useEffect(() => {
    if (focusTitleOnMount) frameRef.current?.querySelector('h1')?.focus();
  }, [focusTitleOnMount]);

  const { values, setValue } = form;
  const save = () =>
    void form.save(async (v) => {
      const saved = await store.save(toInvoice(record, v));
      onSaved?.(saved);
      // The baseline becomes what the "server" returned (normalized), not what was sent.
      return toValues(saved);
    });

  // The save error, when there is one, wins over the summary (`||`, not `??`).
  const message =
    errorText(form.saveError) ||
    getErrorSummary(form.fieldErrors, { formErrors: form.formErrors, message: summaryText });

  return (
    <div
      ref={frameRef}
      style={{ height: '100dvh', boxSizing: 'border-box', display: 'grid', gridTemplateRows: 'minmax(0, 1fr)' }}
    >
      <ValidationProvider fieldErrors={form.fieldErrors}>
        <ObjectPage labels={{ anchorBar: 'Sections' }}>
          <ObjectPageHeader
            title={record.number}
            // The identity shows the SAVED record (the baseline), not the unsaved draft.
            subtitle={form.baseline.supplier || 'No supplier'}
            status={
              <StatusBadge tone={STATUS_TONE[form.baseline.status]}>{STATUS_LABEL[form.baseline.status]}</StatusBadge>
            }
            actions={
              <Button variant="secondary" onClick={() => guard(onBack)}>
                Back to list
              </Button>
            }
          />
          <ObjectPageFooter
            visible={form.isDirty}
            label="Save actions"
            toneLabel="Error"
            message={message}
            messageTone="error"
          >
            <Button onClick={save} aria-disabled={form.isSaving || undefined}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => form.reset()}>
              Discard
            </Button>
          </ObjectPageFooter>
          <ObjectPageSection id="general" title="General">
            <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
              <Field label="Invoice number" state="locked" stateReason="The invoice number is assigned by the system.">
                <Input value={record.number} readOnly />
              </Field>
              <Field label="Supplier" name="supplier" required>
                <Select
                  options={SUPPLIER_OPTIONS}
                  placeholder="Choose a supplier"
                  emptyLabel="No options"
                  value={values.supplier || undefined}
                  onValueChange={(v) => setValue('supplier', v)}
                />
              </Field>
              <Field label="Status" name="status">
                <Select
                  options={STATUS_OPTIONS}
                  emptyLabel="No options"
                  value={values.status}
                  onValueChange={(v) => setValue('status', v as DemoInvoiceStatus)}
                />
              </Field>
            </div>
          </ObjectPageSection>
          <ObjectPageSection id="amount" title="Amount">
            <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
              <Field label="Amount (EUR)" name="amount" required>
                <Input
                  inputMode="decimal"
                  value={values.amount}
                  onChange={(e) => setValue('amount', e.target.value)}
                />
              </Field>
              <Field label="Invoice date" name="date">
                <Input type="date" value={values.date} onChange={(e) => setValue('date', e.target.value)} />
              </Field>
              <Field label="Due date" name="dueDate">
                <Input type="date" value={values.dueDate} onChange={(e) => setValue('dueDate', e.target.value)} />
              </Field>
            </div>
          </ObjectPageSection>
          <ObjectPageSection id="notes" title="Notes">
            <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
              <Field label="Notes" name="notes">
                <Input value={values.notes} onChange={(e) => setValue('notes', e.target.value)} />
              </Field>
            </div>
          </ObjectPageSection>
        </ObjectPage>
      </ValidationProvider>
      {dialog}
    </div>
  );
}
