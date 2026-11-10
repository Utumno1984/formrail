// Story-only: the invoice detail page, composed ONLY from the public Object Page pieces. Not exported
// by the package. Spec §1.4: the editor is mounted already hydrated (`key` per record + `baseline` at
// mount); a fetch in flight is a loading state, never an editor that is hydrated afterwards.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button } from '../button/Button';
import { useConfirmDialog, type ConfirmOptions } from '../confirm-dialog/use-confirm-dialog';
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
import { addDays as addCalendarDays, isIsoDate, localToday } from '../calendar/date-math';
import { InvoiceLineItems } from './InvoiceLineItems';
import { sameLines, toLineValues, toStoredLine, validateLines, type LineValues } from './invoice-lines';
import { InvoiceNotFoundError, type InvoiceDraft, type InvoiceStore, type StoredInvoice } from './invoice-store';
import { STATUS_LABEL, STATUS_TONE, SUPPLIERS_EN } from './showcase-data';

export interface InvoiceRecordPageProps {
  store: InvoiceStore;
  recordId: string;
  /** Called by "Back to list" (after the dirty-guard confirmation when the form is dirty). */
  onBack: () => void;
  /** Called once per successful save with the record as the server stored it. */
  onSaved?: (invoice: StoredInvoice) => void;
  /** CRUD only (#365): see `InvoiceEditorProps.onDelete`. Without it the header has no "Delete". */
  onDelete?: (invoice: StoredInvoice) => Promise<void>;
  /** CRUD only (#365): see `InvoiceEditorProps.onDeleteDone`. */
  onDeleteDone?: () => void;
  /** Story-only extension (#377): see `InvoiceEditorProps.reviewSave`. */
  reviewSave?: InvoiceSaveReviewer;
}

/** The values of the editor, as typed (exported for the Pro story of #377 only; not part of the package). */
export interface InvoiceValues {
  supplier: string;
  status: DemoInvoiceStatus;
  /** Text, as typed; the server normalizes it to 2 decimals. */
  amount: string;
  date: string;
  dueDate: string;
  notes: string;
}

/** All the values of the editor: the scalar ones plus the line items (the Pro review sees only the scalar ones). */
interface InvoiceFormValues extends InvoiceValues {
  lineItems: LineValues[];
}

const toValues = (r: StoredInvoice): InvoiceFormValues => ({
  supplier: r.supplier,
  status: r.status,
  amount: r.amount.toFixed(2),
  date: r.date,
  dueDate: r.dueDate,
  notes: r.notes,
  lineItems: r.lineItems.map(toLineValues),
});

const toInvoice = (record: StoredInvoice, v: InvoiceFormValues): StoredInvoice => ({
  ...record,
  supplier: v.supplier,
  status: v.status,
  amount: Number(v.amount),
  date: v.date,
  dueDate: v.dueDate,
  notes: v.notes,
  lineItems: v.lineItems.map(toStoredLine),
});

/** The scalar part of the values: what `reviewSave` receives. */
const scalarValues = (v: InvoiceFormValues): InvoiceValues => ({
  supplier: v.supplier,
  status: v.status,
  amount: v.amount,
  date: v.date,
  dueDate: v.dueDate,
  notes: v.notes,
});

/** What `reviewSave` receives: the values about to be saved and the REAL saved baseline (never a default). */
export interface InvoiceSaveReviewContext {
  values: InvoiceValues;
  baseline: InvoiceValues;
}

/** The review dialog: the options of the editor's `confirm()` (#344) that the reviewer chooses. */
export type InvoiceSaveReview = Pick<
  ConfirmOptions,
  'title' | 'description' | 'confirmLabel' | 'cancelLabel' | 'tone' | 'initialFocus' | 'children'
>;

/** Builds the review of a save, or `null` to save without one (nothing to review). */
export type InvoiceSaveReviewer = (context: InvoiceSaveReviewContext) => InvoiceSaveReview | null;

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
export function InvoiceRecordPage({ store, recordId, onBack, onSaved, onDelete, onDeleteDone, reviewSave }: InvoiceRecordPageProps) {
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
        onDelete={onDelete}
        onDeleteDone={onDeleteDone}
        reviewSave={reviewSave}
        focusTitleOnMount={attempt > 0}
      />
    </>
  );
}

export interface InvoiceEditorProps {
  store: InvoiceStore;
  /** The record to edit, or `null` to CREATE one (#363): same sections, default values, "Create"/"Cancel". */
  record: StoredInvoice | null;
  onBack: () => void;
  onSaved?: ((invoice: StoredInvoice) => void) | undefined;
  /** After "Retry" the button that had the focus is gone: the title takes it (never `<body>`). */
  focusTitleOnMount: boolean;
  /** Creation only. Today's date (yyyy-mm-dd), the default invoice date. Default: the local date. */
  today?: string;
  /** Creation only. Called once per successful create with the record as the server stored it, even if the page was left meanwhile. */
  onCreated?: (invoice: StoredInvoice) => void;
  /**
   * Creation only. Called once after a successful create, when the form is clean again (the dirty-guard no
   * longer intercepts): the consumer navigates away from here, never right after the `await`.
   */
  onCreateDone?: (invoice: StoredInvoice) => void;
  /**
   * Editing only, CRUD only (#365): adds "Delete" to the header. Deletes the record on the server: the
   * confirmation stays pending until it settles; a rejection keeps it open and interactive (the consumer
   * reports the error). Not called while a save is in flight ("Delete" is `aria-disabled` then).
   */
  onDelete?: (invoice: StoredInvoice) => Promise<void>;
  /**
   * Called once after a confirmed delete, from an effect once the dirty-guard is disarmed: the consumer
   * navigates away from here (the guard would otherwise intercept the `popstate` of `history.back()`).
   */
  onDeleteDone?: () => void;
  /**
   * Story-only extension point (#377, used by the Pro story "Invoices with Change Summary"); absent, nothing
   * changes. Editing only (a creation saves directly: a diff against defaults reviews nothing). On Save, once
   * the form is VALID (with errors Save behaves as without it: the errors, the summary, the focus on the first
   * invalid field) and no save is in flight, it is called with the values and the saved baseline: what it
   * returns is shown in the editor's confirmation dialog; confirming runs the SAME save as without it (there
   * is no second save path), cancelling saves nothing and leaves the form as it was. `null`: saves directly.
   */
  reviewSave?: InvoiceSaveReviewer | undefined;
}

/**
 * The defaults of a new invoice: no supplier, open, no amount, dated today, due in 30 days. `today` comes from
 * a free-text Storybook control: anything that is not a real calendar date (`''`, `2026-02-30`) falls back to
 * the local date (the calendar helpers' `isIsoDate` checks the day against the month).
 */
const defaultValues = (today: string | undefined): InvoiceFormValues => {
  const date = isIsoDate(today) ? today : localToday();
  return {
    supplier: '',
    status: 'pending',
    amount: '',
    date,
    dueDate: addCalendarDays(date, 30) ?? date,
    notes: '',
    lineItems: [],
  };
};

const toDraft = (v: InvoiceFormValues): InvoiceDraft => ({
  supplier: v.supplier,
  status: v.status,
  amount: Number(v.amount),
  date: v.date,
  dueDate: v.dueDate,
  notes: v.notes,
  lineItems: v.lineItems.map(toStoredLine),
});

// The amount is text; "1295.9" and "1295.90" are the same number, so typing the shorter form of the
// baseline is not a change. Exported for the Pro story of #377 (its change summary compares the same way).
export const sameAmount = (a: string, b: string): boolean => a === b || (a.trim() !== '' && b.trim() !== '' && Number(a) === Number(b));
export const sameValues = (a: InvoiceFormValues, b: InvoiceFormValues): boolean =>
  sameAmount(a.amount, b.amount) &&
  a.supplier === b.supplier &&
  a.status === b.status &&
  a.date === b.date &&
  a.dueDate === b.dueDate &&
  a.notes === b.notes &&
  sameLines(a.lineItems, b.lineItems);

const DECIMAL = /^\d+(\.\d+)?$/;
const validateInvoice = (v: InvoiceFormValues): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!v.supplier) errors.supplier = 'Supplier is required.';
  if (!DECIMAL.test(v.amount.trim()) || Number(v.amount) <= 0) {
    errors.amount = 'Amount must be greater than 0.';
  }
  return { ...errors, ...validateLines(v.lineItems) };
};
const hasErrors = (errors: Partial<Record<string, string>>): boolean => Object.values(errors).some((e) => e !== undefined);
const SAVING_HINT = 'Saving… Discard only restores the form: the save still completes.';

export function InvoiceEditor({
  store,
  record,
  onBack,
  onSaved,
  focusTitleOnMount,
  today,
  onCreated,
  onCreateDone,
  onDelete,
  onDeleteDone,
  reviewSave,
}: InvoiceEditorProps) {
  const creating = record === null;
  // #365: `deleting` while the confirmed delete waits for the server; `deleted` once the server deleted the
  // record (set in the same callback, so no render ever has both false in between). `deleting` ARMS the guard
  // like a save in flight does (browser Back asks "Delete in progress", also on a clean form); `deleted`
  // disarms it (whatever was unsaved is gone with the record, and the dialog said so) BEFORE the navigation,
  // which starts from an effect (below). Until that navigation lands (`history.back()` is asynchronous) the page
  // is still mounted: from `deleting` on, Save/Discard/Delete do nothing, and from `deleted` on the footer is
  // gone (code review of #372: a Save there reached the store for a record it had just deleted).
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const deleteBusy = deleting || deleted;
  const [confirm, confirmDialog] = useConfirmDialog();
  const form = useObjectPageForm<InvoiceFormValues>({
    baseline: record ? toValues(record) : defaultValues(today),
    isEqual: sameValues,
    validate: validateInvoice,
  });
  // #166: while a save is in flight, leaving cannot discard anything (the save still lands in the store), so
  // the guard stays armed (even after a footer "Discard" made the form clean) and the dialog says what really
  // happens (this also covers browser Back, which opens the same dialog). The "save" wording is sticky: it is
  // set as soon as a save starts and cleared only by real unsaved edits once no save runs. So a dialog that is
  // open when the save settles with a clean form keeps saying what it said; if the save fails or edits made
  // meanwhile remain, the form is dirty again and the wording goes back to "unsaved changes" (which is true).
  const [savingWording, setSavingWording] = useState(false);
  useEffect(() => {
    if (form.isSaving) setSavingWording(true);
    else if (form.isDirty) setSavingWording(false);
  }, [form.isSaving, form.isDirty]);
  // The values the save in flight sends: an edit made after Save is NOT part of it and would be lost on leaving.
  const sentRef = useRef<InvoiceFormValues | null>(null);
  const editedSinceSave = form.isSaving && form.isDirty && !!sentRef.current && !sameValues(form.values, sentRef.current);
  // The "delete" wording is sticky like the "save" one: a guard dialog opened during the delete keeps saying
  // what it said if the delete then fails (a clean form disarms the guard, but an open dialog stays until the
  // user chooses); real unsaved edits, once no delete runs, bring back the "unsaved changes" wording.
  const [deleteWording, setDeleteWording] = useState(false);
  useEffect(() => {
    if (deleting) setDeleteWording(true);
    else if (form.isDirty) setDeleteWording(false);
  }, [deleting, form.isDirty]);
  const { guard, dialog } = useDirtyGuard({
    when: !deleted && (form.isDirty || form.isSaving || deleting),
    labels: deleting || deleteWording
      ? {
          title: 'Delete in progress',
          description: form.isDirty
            ? 'The invoice is being deleted. Leaving does not cancel it: it will complete in the background. Your unsaved changes will be lost.'
            : 'The invoice is being deleted. Leaving does not cancel it: it will complete in the background.',
          stay: 'Stay',
          leave: 'Leave anyway',
          close: 'Close',
        }
      : editedSinceSave
      ? {
          title: 'Unsaved changes',
          description:
            'A save is in progress and will complete, but the changes you made after pressing Save are not part of it and will be lost.',
          stay: 'Keep editing',
          leave: 'Discard newer changes',
          close: 'Close',
        }
      : savingWording || form.isSaving
      ? {
          title: 'Unsaved changes',
          description: 'A save is still in progress. Leaving does not cancel it: it will complete in the background.',
          stay: 'Keep editing',
          leave: 'Leave anyway',
          close: 'Close',
        }
      : {
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
  const baselineLineIds = useMemo(() => new Set(form.baseline.lineItems.map((l) => l.id)), [form.baseline]);
  // Creation: the record the server created. The way out waits for the CLEAN form that follows (below).
  const [created, setCreated] = useState<StoredInvoice | null>(null);
  const save = () => {
    if (deleteBusy) return; // the record is being (or has been) deleted: nothing left to save
    // Already created (the user kept typing during the save and kept editing at the guard): never a second
    // record; the button only asks to leave again.
    if (created) return guard(() => onCreateDone?.(created));
    if (!record || !reviewSave) return commit();
    // #377: no review while a save is in flight (Save is `aria-disabled`, which does not block a click), and
    // none of an invalid form: `commit` then fails the validation exactly as without a review.
    if (form.isSaving) return;
    if (hasErrors(validateInvoice(form.values))) return commit();
    const review = reviewSave({ values: scalarValues(form.values), baseline: scalarValues(form.baseline) });
    if (!review) return commit();
    // No `onConfirm`: the dialog closes at once and the save shows its progress in the footer, as without it.
    void confirm(review).then((ok) => {
      if (ok) commit();
    });
  };
  const commit = () => {
    void form.save(async (v) => {
      sentRef.current = v;
      if (!record) {
        const made = await store.create(toDraft(v));
        onCreated?.(made);
        setCreated(made);
        // The baseline becomes the created record as the "server" returned it.
        return toValues(made);
      }
      const saved = await store.save(toInvoice(record, v));
      onSaved?.(saved);
      // The baseline becomes what the "server" returned (normalized), not what was sent.
      return toValues(saved);
    });
  };

  // The navigation after a Create starts from HERE, after the commit of the clean form, not right after the
  // `await`: while `isDirty`/`isSaving` are true the guard also intercepts the `popstate` of `history.back()`
  // and would open "Unsaved changes" after a successful Create. If the user kept typing during the save the
  // form is dirty again and the guard (rightly) asks about those newer edits.
  const doneRef = useRef(false);
  useEffect(() => {
    if (!created || form.isSaving || doneRef.current) return;
    doneRef.current = true;
    guard(() => onCreateDone?.(created));
  }, [created, form.isSaving, guard, onCreateDone]);

  // #365: pessimistic. The confirmation stays pending (spinner, no second confirm, no Escape) until the server
  // answers: on this page the record must not "go away" before it is known to be gone. A failure keeps the
  // dialog open and interactive (the consumer shows the error toast): retry or Cancel, which gives the focus
  // back to "Delete".
  const remove = () => {
    if (!record || !onDelete || form.isSaving || deleteBusy) return; // `aria-disabled` does not block a click
    void confirm({
      title: `Delete invoice ${record.number}?`,
      description: form.isDirty
        ? 'The invoice is deleted permanently. Unsaved changes will be lost too.'
        : 'The invoice is deleted permanently.',
      confirmLabel: 'Delete invoice',
      onConfirm: async () => {
        setDeleting(true);
        try {
          await onDelete(record);
        } catch (error) {
          setDeleting(false); // the dialog stays open: retry or Cancel
          throw error;
        }
        setDeleted(true);
      },
      // Reported by the consumer (a toast); handled, so not an uncaught error.
      onError: () => undefined,
    });
  };
  // The navigation starts after the commit that disarmed the guard (the same reason as for the Create).
  const deleteDoneRef = useRef(false);
  useEffect(() => {
    if (!deleted || deleteDoneRef.current) return;
    deleteDoneRef.current = true;
    onDeleteDone?.();
  }, [deleted, onDeleteDone]);

  // The save error, when there is one, wins over the summary (`||`, not `??`).
  const problem =
    errorText(form.saveError) ||
    getErrorSummary(form.fieldErrors, { formErrors: form.formErrors, message: summaryText });
  // #166: while a save runs, the footer Discard only restores the form (the save still lands): say it BEFORE
  // the click, since the footer hides once the form is clean.
  const message = problem || (form.isSaving ? (creating ? 'Saving…' : SAVING_HINT) : undefined);

  return (
    <div
      ref={frameRef}
      style={{ height: '100dvh', boxSizing: 'border-box', display: 'grid', gridTemplateRows: 'minmax(0, 1fr)' }}
    >
      <ValidationProvider fieldErrors={form.fieldErrors}>
        <ObjectPage labels={{ anchorBar: 'Sections' }}>
          <ObjectPageHeader
            title={record ? record.number : 'New invoice'}
            // The identity shows the SAVED record (the baseline), not the unsaved draft. A new invoice has
            // neither a subtitle nor a status badge yet.
            subtitle={record ? form.baseline.supplier || 'No supplier' : undefined}
            status={
              record ? (
                <StatusBadge tone={STATUS_TONE[form.baseline.status]}>{STATUS_LABEL[form.baseline.status]}</StatusBadge>
              ) : undefined
            }
            actions={
              <>
                <Button variant="secondary" onClick={() => guard(onBack)}>
                  Back to list
                </Button>
                {record && onDelete ? (
                  <Button variant="secondary" onClick={remove} aria-disabled={form.isSaving || deleteBusy || undefined}>
                    Delete
                  </Button>
                ) : null}
              </>
            }
          />
          <ObjectPageFooter
            visible={!deleted && (creating || form.isDirty)}
            label="Save actions"
            toneLabel={problem ? 'Error' : 'Information'}
            message={message}
            messageTone={problem ? 'error' : 'info'}
          >
            <Button onClick={save} aria-disabled={form.isSaving || deleteBusy || undefined}>
              {creating ? 'Create' : 'Save'}
            </Button>
            {creating ? (
              // Leaves the page (through the guard); it is not the "Discard" of the Update.
              <Button variant="secondary" onClick={() => guard(onBack)}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  if (!deleteBusy) form.reset();
                }}
                aria-disabled={deleteBusy || undefined}
              >
                Discard
              </Button>
            )}
          </ObjectPageFooter>
          <ObjectPageSection id="general" title="General">
            <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
              <Field label="Invoice number" state="locked" stateReason="The invoice number is assigned by the system.">
                <Input value={record ? record.number : 'Assigned on save'} readOnly />
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
          <ObjectPageSection id="line-items" title="Line items">
            <InvoiceLineItems
              lines={values.lineItems}
              baselineIds={baselineLineIds}
              onChange={(next) => setValue('lineItems', next)}
            />
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
      {confirmDialog}
    </div>
  );
}
