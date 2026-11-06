// Live demos embedded in Introduction.mdx. They import from the public entry point
// (`@react-object-page/core`, aliased to the sources in main.ts): the page uses the library
// the way a consumer would, instead of showing code as text.
import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  Button,
  Field,
  Input,
  ListReport,
  StatusBadge,
  useListReport,
  useObjectPageForm,
  type ListReportColumn,
  type ListReportFilter,
} from '@react-object-page/core';

interface Invoice {
  id: string;
  number: string;
  supplier: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
}

const INVOICES: Invoice[] = [
  { id: '1', number: 'INV-1001', supplier: 'Northwind Components', amount: 1240, status: 'pending' },
  { id: '2', number: 'INV-1002', supplier: 'Contoso Logistics', amount: 380.5, status: 'approved' },
  { id: '3', number: 'INV-1003', supplier: 'Fabrikam Office', amount: 92, status: 'rejected' },
  { id: '4', number: 'INV-1004', supplier: 'Tailspin Energy', amount: 5120, status: 'pending' },
  { id: '5', number: 'INV-1005', supplier: 'Adventure Works', amount: 760, status: 'approved' },
  { id: '6', number: 'INV-1006', supplier: 'Litware Consulting', amount: 2300, status: 'pending' },
];

const STATUS_LABEL = { pending: 'To approve', approved: 'Approved', rejected: 'Rejected' } as const;
const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'error' } as const;

const COLUMNS: ListReportColumn<Invoice>[] = [
  { id: 'number', header: 'Number', accessor: (r) => r.number, width: 120 },
  { id: 'supplier', header: 'Supplier', accessor: (r) => r.supplier, minWidth: 180 },
  {
    id: 'amount',
    header: 'Amount',
    accessor: (r) => r.amount,
    cell: (r) => `€ ${r.amount.toFixed(2)}`,
    align: 'end',
    firstSortDirection: 'desc',
    searchable: false,
    width: 120,
  },
  {
    id: 'status',
    header: 'Status',
    accessor: (r) => STATUS_LABEL[r.status],
    cell: (r) => <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>,
    searchable: false,
    width: 140,
  },
];

const FILTERS: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'To approve', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (r) => r.status === 'approved' },
  { id: 'rejected', label: 'Rejected', predicate: (r) => r.status === 'rejected' },
];

/** A real List Report: filter pills, search, sortable columns, a footprint that never jumps. */
export function ListReportDemo() {
  const table = useListReport<Invoice>({
    rows: INVOICES,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
  });
  return (
    <div style={{ height: 380 }}>
      <ListReport title="Invoices" table={table} actions={<Button variant="primary">New invoice</Button>} filtersLabel="Filters" searchLabel="Search" />
    </div>
  );
}

interface Supplier {
  name: string;
  city: string;
}
const BASELINE: Supplier = { name: 'Northwind Components', city: 'Leeds' };

/** Dirty tracking against the real saved baseline: typing and then undoing the edit is clean again. */
export function DirtyTrackingDemo() {
  const form = useObjectPageForm<Supplier>({ baseline: BASELINE });
  const [saved, setSaved] = useState(false);
  const { values, setValue } = form;
  return (
    <div style={STACK}>
      <div style={ROW}>
        <StatusBadge tone={form.isDirty ? 'warning' : 'success'}>{form.isDirty ? 'Unsaved changes' : 'No changes'}</StatusBadge>
        {saved && !form.isDirty ? <span>Saved.</span> : null}
      </div>
      <Field label="Supplier" name="name">
        <Input
          value={values.name}
          onChange={(e) => {
            setSaved(false);
            setValue('name', e.target.value);
          }}
        />
      </Field>
      <Field label="City" name="city">
        <Input
          value={values.city}
          onChange={(e) => {
            setSaved(false);
            setValue('city', e.target.value);
          }}
        />
      </Field>
      <div style={ROW}>
        <Button
          variant="primary"
          onClick={() => {
            if (!form.isDirty) return;
            void form.save(async () => {
              setSaved(true);
            });
          }}
          aria-disabled={!form.isDirty || undefined}
        >
          Save
        </Button>
        <Button variant="secondary" onClick={() => form.reset()}>
          Discard changes
        </Button>
      </div>
      <small style={{ color: 'var(--color-rop-text-muted)' }}>
        Edit a field, then type the original value back: the form is clean again, because it is compared with the saved baseline.
      </small>
    </div>
  );
}

/** Locked/forced/disabled fields: not operable from the keyboard either, with a real `aria-describedby` reason. */
export function FieldStatesDemo() {
  return (
    <div style={STACK}>
      <Field label="Approver" name="approver" state="locked" stateReason="You do not have permission to edit this field.">
        <Input defaultValue="Ada Lovelace" />
      </Field>
      <Field label="Currency" name="currency" state="forced" stateReason="Set by a business rule.">
        <Input defaultValue="EUR" />
      </Field>
      <Field label="Cost center" name="cc" state="disabled" stateReason="Not editable in this status.">
        <Input defaultValue="CC-4410" />
      </Field>
      <small style={{ color: 'var(--color-rop-text-muted)' }}>
        Press Tab: the locked and forced fields stay focusable so a screen reader reads the reason; the disabled one is skipped.
      </small>
    </div>
  );
}

/**
 * Two wrappers, same components: the second one only redefines CSS custom properties. Static on
 * purpose: the interactive theme switcher belongs to the Theming section (ticket #276).
 */
export function ThemeOverrideDemo() {
  const themed = { '--color-rop-primary': '#6b3fa0', '--radius-rop-md': '1rem' } as CSSProperties;
  const sample = (
    <div style={ROW}>
      <Button variant="primary">Primary action</Button>
      <Button variant="secondary">Secondary</Button>
      <StatusBadge tone="info">Info</StatusBadge>
    </div>
  );
  return (
    <div style={STACK}>
      <small>Default theme</small>
      {sample}
      <small>
        Same components inside an element with <code>--color-rop-primary: #6b3fa0</code> and <code>--radius-rop-md: 1rem</code>
      </small>
      <div style={themed} data-testid="theme-override">
        {sample}
      </div>
    </div>
  );
}

const STACK: CSSProperties = { display: 'grid', gap: 12, maxWidth: 440 };
const ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' };

const DEMO_FRAME: CSSProperties = {
  border: '1px solid var(--color-rop-border-subtle, #c4cdd6)',
  borderRadius: 8,
  padding: 16,
  margin: '12px 0 24px',
  boxSizing: 'border-box',
};

/** Border and padding around a live example, so it reads as a demo and not as page text. */
export function DemoFrame({ children }: { children: ReactNode }) {
  return <div style={DEMO_FRAME}>{children}</div>;
}
