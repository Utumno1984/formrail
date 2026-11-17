// Story-only (#520): the Sales orders module of the record-editing shell (`RecordCrud`), the second `RecordModule`
// after the invoices (modules/invoices/invoices-module.tsx, the file this one follows). Everything here belongs to
// sales orders only: their words, their list (columns and pills), their form (values, validation, the sections of the
// record page as explicit JSX) and their store. The flow (navigation, dirty-guard, toasts, focus, scroll) is the
// shell's. Creation and deletion are not part of this module yet (#521). Not exported by the package.
import { useMemo } from 'react';
import { isIsoDate } from '../../../calendar/date-math';
import { Field } from '../../../field/Field';
import { Input } from '../../../input/Input';
import {
  DEMO_FX_PER_EUR,
  CURRENCY_MINOR_DIGITS,
  SALES_ORDER_STATUS_LABEL,
  SALES_ORDER_STATUS_TONE,
  formatDate,
  formatMoney,
  type DemoCurrency,
  type DemoSalesOrderStatus,
} from '../../../internal/demo-data';
import { ObjectPageSection } from '../../../object-page/ObjectPageSection';
import { Select } from '../../../select/Select';
import { StatusBadge } from '../../../status-badge/StatusBadge';
import type { ListReportColumn, ListReportFilter } from '../../../list-report/types';
import type { RecordModule, RecordSectionsProps } from '../../record-module';
import { createSalesOrderStore, type SalesOrderDraft, type StoredSalesOrder } from '../../sales-order-store';
import { helpProps } from '../field-help';
import { SalesOrderLines } from './SalesOrderLines';
import {
  orderTotal,
  sameLines,
  toLineValues,
  toStoredLine,
  validateLines,
  type LineErrorKey,
  type OrderLineValues,
} from './order-lines';

/**
 * The values of the editor, as typed. `customerName` and `currency` are carried, not edited: the validation and the
 * header need them and the form is the only thing they receive.
 */
export interface SalesOrderValues {
  customerName: string;
  currency: DemoCurrency;
  status: DemoSalesOrderStatus;
  customerReference: string;
  orderDate: string;
  requestedDeliveryDate: string;
  deliveryNotes: string;
  notes: string;
  lines: OrderLineValues[];
}

const toValues = (r: StoredSalesOrder): SalesOrderValues => ({
  customerName: r.customerName,
  currency: r.currency,
  status: r.status,
  customerReference: r.customerReference,
  orderDate: r.orderDate,
  requestedDeliveryDate: r.requestedDeliveryDate,
  deliveryNotes: r.deliveryNotes,
  notes: r.notes,
  lines: r.lines.map((l) => toLineValues(l, r.currency)),
});

const toOrder = (record: StoredSalesOrder, v: SalesOrderValues): StoredSalesOrder => ({
  ...record,
  status: v.status,
  customerReference: v.customerReference,
  orderDate: v.orderDate,
  requestedDeliveryDate: v.requestedDeliveryDate,
  deliveryNotes: v.deliveryNotes,
  notes: v.notes,
  lines: v.lines.map((l) => toStoredLine(l, record.currency)),
});

export const sameValues = (a: SalesOrderValues, b: SalesOrderValues): boolean =>
  a.status === b.status &&
  a.customerReference === b.customerReference &&
  a.orderDate === b.orderDate &&
  a.requestedDeliveryDate === b.requestedDeliveryDate &&
  a.deliveryNotes === b.deliveryNotes &&
  a.notes === b.notes &&
  sameLines(a.lines, b.lines, a.currency);

type SalesOrderErrors = Partial<Record<keyof SalesOrderValues | LineErrorKey, string>>;
const validateOrder = (v: SalesOrderValues): SalesOrderErrors => {
  const errors: SalesOrderErrors = {};
  if (!isIsoDate(v.orderDate)) errors.orderDate = 'Order date is required.';
  if (!isIsoDate(v.requestedDeliveryDate)) errors.requestedDeliveryDate = 'Requested delivery date is required.';
  else if (isIsoDate(v.orderDate) && v.requestedDeliveryDate < v.orderDate) {
    errors.requestedDeliveryDate = 'Requested delivery cannot be before the order date.';
  }
  if (v.lines.length === 0) errors.lines = 'Add at least one line.';
  return { ...errors, ...validateLines(v.lines, v.currency) };
};

const STATUS_OPTIONS = (Object.keys(SALES_ORDER_STATUS_LABEL) as DemoSalesOrderStatus[]).map((s) => ({
  value: s,
  label: SALES_ORDER_STATUS_LABEL[s],
}));

/** What the order total is when read as text: the saved lines' total in the order's currency (0 when a line is unfinished). */
const totalText = (v: SalesOrderValues): string => formatMoney(orderTotal(v.lines, v.currency) ?? 0, v.currency);

const COLUMN = { display: 'grid', gap: 16, maxWidth: 420 } as const;
const READ_ONLY_REASON = 'A cancelled order cannot be edited.';

/** The sections of the sales order page: the fields, as explicit JSX. */
function SalesOrderSections({ form, record, help }: RecordSectionsProps<StoredSalesOrder, SalesOrderValues>) {
  const { values, setValue } = form;
  // The page is read-only when the SAVED status is cancelled, not when the draft is changed to it.
  const readOnly = form.baseline.status === 'cancelled';
  const state = readOnly ? ({ state: 'locked', stateReason: READ_ONLY_REASON } as const) : {};
  const baselineLineIds = useMemo(() => new Set(form.baseline.lines.map((l) => l.id)), [form.baseline]);
  const live = orderTotal(values.lines, values.currency);
  return (
    <>
      <ObjectPageSection id="general" title="General">
        <div style={COLUMN}>
          <Field label="Order number" state="locked" stateReason="The order number is assigned by the system.">
            <Input value={record ? record.number : 'Assigned on save'} readOnly />
          </Field>
          <Field label="Customer" state="locked" stateReason="The customer cannot be changed once the order exists.">
            <Input value={values.customerName} readOnly />
          </Field>
          <Field label="Currency" state="locked" stateReason="The currency is the customer's.">
            <Input value={values.currency} readOnly />
          </Field>
          <Field label="Status" name="status" {...state} {...helpProps(help, 'status')}>
            <Select
              options={STATUS_OPTIONS}
              emptyLabel="No options"
              value={values.status}
              onValueChange={(v) => setValue('status', v as DemoSalesOrderStatus)}
            />
          </Field>
          <Field label="Customer reference" name="customerReference" {...state} {...helpProps(help, 'customerReference')}>
            <Input value={values.customerReference} onChange={(e) => setValue('customerReference', e.target.value)} />
          </Field>
          <Field label="Order date" name="orderDate" required {...state} {...helpProps(help, 'orderDate')}>
            <Input type="date" value={values.orderDate} onChange={(e) => setValue('orderDate', e.target.value)} />
          </Field>
        </div>
      </ObjectPageSection>
      <ObjectPageSection id="lines" title="Lines">
        <SalesOrderLines
          lines={values.lines}
          currency={values.currency}
          baselineIds={baselineLineIds}
          onChange={(next) => setValue('lines', next)}
          readOnly={readOnly}
          readOnlyReason={READ_ONLY_REASON}
          listError={form.fieldErrors.lines}
          fieldHelp={help}
        />
        <p style={{ margin: '16px 0 0' }}>
          Order total: <strong data-order-total="">{live === null ? '—' : formatMoney(live, values.currency)}</strong>
        </p>
      </ObjectPageSection>
      <ObjectPageSection id="delivery" title="Delivery">
        <div style={COLUMN}>
          <Field label="Requested delivery" name="requestedDeliveryDate" required {...state} {...helpProps(help, 'requestedDeliveryDate')}>
            <Input type="date" value={values.requestedDeliveryDate} onChange={(e) => setValue('requestedDeliveryDate', e.target.value)} />
          </Field>
          <Field label="Delivery instructions" name="deliveryNotes" {...state} {...helpProps(help, 'deliveryNotes')}>
            <Input value={values.deliveryNotes} onChange={(e) => setValue('deliveryNotes', e.target.value)} />
          </Field>
        </div>
      </ObjectPageSection>
      <ObjectPageSection id="notes" title="Notes">
        <div style={COLUMN}>
          <Field label="Notes" name="notes" {...state} {...helpProps(help, 'notes')}>
            <Input value={values.notes} onChange={(e) => setValue('notes', e.target.value)} />
          </Field>
        </div>
      </ObjectPageSection>
    </>
  );
}

/** What a column sorts a total by: the amount in EUR, so a yen total does not outweigh a euro one (units differ). */
const totalInEur = (r: StoredSalesOrder): number =>
  r.totalMinor / 10 ** CURRENCY_MINOR_DIGITS[r.currency] / DEMO_FX_PER_EUR[r.currency];

const COLUMNS: readonly ListReportColumn<StoredSalesOrder>[] = [
  { id: 'number', header: 'Number', accessor: (r) => r.number, width: 190 },
  { id: 'customer', header: 'Customer', accessor: (r) => r.customerName, minWidth: 220 },
  { id: 'orderDate', header: 'Order date', accessor: (r) => r.orderDate, cell: (r) => formatDate(r.orderDate), searchable: false, width: 140 },
  {
    id: 'requestedDelivery',
    header: 'Requested delivery',
    accessor: (r) => r.requestedDeliveryDate,
    cell: (r) => formatDate(r.requestedDeliveryDate),
    searchable: false,
    width: 180,
  },
  {
    id: 'total',
    header: 'Total',
    accessor: totalInEur,
    cell: (r) => formatMoney(r.totalMinor, r.currency),
    align: 'end',
    firstSortDirection: 'desc',
    searchable: false,
    width: 150,
  },
  {
    id: 'status',
    header: 'Status',
    accessor: (r) => SALES_ORDER_STATUS_LABEL[r.status],
    cell: (r) => <StatusBadge tone={SALES_ORDER_STATUS_TONE[r.status]}>{SALES_ORDER_STATUS_LABEL[r.status]}</StatusBadge>,
    searchable: false,
    width: 150,
  },
];

const FILTERS: readonly ListReportFilter<StoredSalesOrder>[] = [
  { id: 'all', label: 'All' },
  ...(Object.keys(SALES_ORDER_STATUS_LABEL) as DemoSalesOrderStatus[]).map((status) => ({
    id: status,
    label: SALES_ORDER_STATUS_LABEL[status],
    predicate: (r: StoredSalesOrder) => r.status === status,
  })),
];

const LABELS = {
  loading: 'Loading…',
  empty: 'No sales orders',
  noResults: 'No results for the current filters',
  error: 'Could not load the sales orders',
  retry: 'Retry',
  clearFilters: 'Clear filters',
  resultCount: (count: number) => (count === 1 ? '1 result' : `${count} results`),
  count: (resultCount: number, totalCount: number) =>
    resultCount === totalCount ? `(${resultCount})` : `(${resultCount} of ${totalCount})`,
};

/**
 * The Sales orders module: list (200 orders), record page with lines. No creation, no deletion: those are
 * #521's. The header shows the saved customer, status and total.
 */
export const SALES_ORDERS: RecordModule<StoredSalesOrder, SalesOrderValues, SalesOrderDraft> = {
  name: 'sales-orders',
  noun: { one: 'sales order', many: 'sales orders' },
  createStore: () => createSalesOrderStore(),
  recordName: (order) => order.number,
  list: { columns: COLUMNS, filters: FILTERS, linkColumn: 'number', labels: LABELS },
  form: {
    toValues,
    isEqual: sameValues,
    validate: validateOrder,
    toRecord: toOrder,
    // The identity shows the SAVED order (the baseline), not the unsaved draft.
    subtitle: (saved) => `${saved.customerName} · ${totalText(saved)}`,
    status: (saved) => (
      <StatusBadge tone={SALES_ORDER_STATUS_TONE[saved.status]}>{SALES_ORDER_STATUS_LABEL[saved.status]}</StatusBadge>
    ),
    Sections: SalesOrderSections,
  },
};
