// Story-only (#519): the Invoices module of the record-editing shell (`RecordCrud`), the first `RecordModule`
// (record-module.ts). Everything here belongs to invoices only: their words, their list (columns and pills
// shared with the List Report showcase, `invoice-list-shared.ts`), their form (values, validation, the sections
// of the record page as explicit JSX) and their store. The flow (navigation, dirty-guard, toasts, confirmations,
// focus, scroll) is the shell's and is not repeated here: a new domain copies THIS file. Not exported by the
// package.
import { useMemo } from 'react';
import { addDays as addCalendarDays, isIsoDate, localToday } from '../../../calendar/date-math';
import { Field } from '../../../field/Field';
import { Input } from '../../../input/Input';
import { ObjectPageSection } from '../../../object-page/ObjectPageSection';
import { Select } from '../../../select/Select';
import { StatusBadge } from '../../../status-badge/StatusBadge';
import { COLUMNS, FILTERS, LABELS } from '../../invoice-list-shared';
import { createInvoiceStore, type InvoiceDraft, type StoredInvoice } from '../../invoice-store';
import { DECIMAL, isPlainPositive, isTooLarge, sameNumberText } from '../../number-text';
import type { RecordModule, RecordSectionsProps } from '../../record-module';
import { STATUS_LABEL, STATUS_TONE, SUPPLIERS_EN } from '../../showcase-data';
import { helpProps } from '../field-help';
import { InvoiceLineItems } from './InvoiceLineItems';
import { sameLines, toLineValues, toStoredLine, validateLines, type LineErrorKey, type LineValues } from './invoice-lines';

type InvoiceStatus = StoredInvoice['status'];

/** The values of the editor, as typed (exported for the Pro story of #377 only; not part of the package). */
export interface InvoiceValues {
  supplier: string;
  status: InvoiceStatus;
  /** Text, as typed; the server normalizes it to 2 decimals. */
  amount: string;
  date: string;
  dueDate: string;
  notes: string;
}

/** All the values of the editor: the scalar ones plus the line items (the Pro review sees them too since #379). */
export interface InvoiceFormValues extends InvoiceValues {
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
export const sameAmount = sameNumberText;
export const sameValues = (a: InvoiceFormValues, b: InvoiceFormValues): boolean =>
  sameAmount(a.amount, b.amount) &&
  a.supplier === b.supplier &&
  a.status === b.status &&
  a.date === b.date &&
  a.dueDate === b.dueDate &&
  a.notes === b.notes &&
  sameLines(a.lineItems, b.lineItems);

type InvoiceErrors = Partial<Record<keyof InvoiceValues | LineErrorKey, string>>;
const validateInvoice = (v: InvoiceFormValues): InvoiceErrors => {
  const errors: InvoiceErrors = {};
  if (!v.supplier) errors.supplier = 'Supplier is required.';
  if (!isPlainPositive(v.amount, DECIMAL)) {
    errors.amount = isTooLarge(v.amount, DECIMAL) ? 'Amount must be less than 1e21.' : 'Amount must be greater than 0.';
  }
  return { ...errors, ...validateLines(v.lineItems) };
};

const SUPPLIER_OPTIONS = SUPPLIERS_EN.map((s) => ({ value: s, label: s }));
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as InvoiceStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

const COLUMN = { display: 'grid', gap: 16, maxWidth: 420 } as const;

/** The sections of the invoice page (and of the creation page): the fields, as explicit JSX. */
function InvoiceSections({ form, record, help }: RecordSectionsProps<StoredInvoice, InvoiceFormValues>) {
  const { values, setValue } = form;
  const baselineLineIds = useMemo(() => new Set(form.baseline.lineItems.map((l) => l.id)), [form.baseline]);
  return (
    <>
      <ObjectPageSection id="general" title="General">
        <div style={COLUMN}>
          <Field label="Invoice number" state="locked" stateReason="The invoice number is assigned by the system.">
            <Input value={record ? record.number : 'Assigned on save'} readOnly />
          </Field>
          <Field label="Supplier" name="supplier" required {...helpProps(help, 'supplier')}>
            <Select
              options={SUPPLIER_OPTIONS}
              placeholder="Choose a supplier"
              emptyLabel="No options"
              value={values.supplier || undefined}
              onValueChange={(v) => setValue('supplier', v)}
            />
          </Field>
          <Field label="Status" name="status" {...helpProps(help, 'status')}>
            <Select
              options={STATUS_OPTIONS}
              emptyLabel="No options"
              value={values.status}
              onValueChange={(v) => setValue('status', v as InvoiceStatus)}
            />
          </Field>
        </div>
      </ObjectPageSection>
      <ObjectPageSection id="amount" title="Amount">
        <div style={COLUMN}>
          <Field label="Amount (EUR)" name="amount" required {...helpProps(help, 'amount')}>
            <Input inputMode="decimal" value={values.amount} onChange={(e) => setValue('amount', e.target.value)} />
          </Field>
          <Field label="Invoice date" name="date" {...helpProps(help, 'date')}>
            <Input type="date" value={values.date} onChange={(e) => setValue('date', e.target.value)} />
          </Field>
          <Field label="Due date" name="dueDate" {...helpProps(help, 'dueDate')}>
            <Input type="date" value={values.dueDate} onChange={(e) => setValue('dueDate', e.target.value)} />
          </Field>
        </div>
      </ObjectPageSection>
      <ObjectPageSection id="line-items" title="Line items">
        <InvoiceLineItems
          lines={values.lineItems}
          baselineIds={baselineLineIds}
          onChange={(next) => setValue('lineItems', next)}
          fieldHelp={help}
        />
      </ObjectPageSection>
      <ObjectPageSection id="notes" title="Notes">
        <div style={COLUMN}>
          <Field label="Notes" name="notes" {...helpProps(help, 'notes')}>
            <Input value={values.notes} onChange={(e) => setValue('notes', e.target.value)} />
          </Field>
        </div>
      </ObjectPageSection>
    </>
  );
}

/**
 * The Invoices module: list, record page, creation, deletion from the row and from the page, bulk deletion.
 * The list -> record showcase of #150 uses the same module without the last three (`InvoiceListToRecord`).
 */
export const INVOICES: RecordModule<StoredInvoice, InvoiceFormValues, InvoiceDraft> = {
  name: 'invoices',
  noun: { one: 'invoice', many: 'invoices' },
  createStore: () => createInvoiceStore(),
  recordName: (invoice) => invoice.number,
  list: { columns: COLUMNS, filters: FILTERS, linkColumn: 'number', labels: LABELS },
  form: {
    toValues,
    isEqual: sameValues,
    validate: validateInvoice,
    toRecord: toInvoice,
    // The identity shows the SAVED invoice (the baseline), not the unsaved draft.
    subtitle: (saved) => saved.supplier || 'No supplier',
    status: (saved) => <StatusBadge tone={STATUS_TONE[saved.status]}>{STATUS_LABEL[saved.status]}</StatusBadge>,
    Sections: InvoiceSections,
  },
  create: { defaults: defaultValues, toDraft },
  delete: true,
  deleteMany: true,
};
