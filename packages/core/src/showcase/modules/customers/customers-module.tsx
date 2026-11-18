// Story-only (#523): the Customers module of the record-editing shell (`RecordCrud`), the record of another SHAPE than
// the sales order (modules/sales-orders/sales-orders-module.tsx, the file this one follows): no lines with totals,
// but a nested object (the billing address, its fields at `billingAddress.*`), an array of contacts with ids, a
// relation to an employee (the account manager, a Combobox), a credit limit in the customer's currency and a status
// with an archived state. Everything here belongs to customers only; the flow is the shell's. Customers are not
// created nor deleted here: they are archived (status "Archived", then Save) and restored ("Restore" in the header).
// Not exported by the package.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Button } from '../../../button/Button';
import { Combobox } from '../../../combobox/Combobox';
import { Field } from '../../../field/Field';
import { Input } from '../../../input/Input';
import {
  COUNTRY_NAME,
  CURRENCY_MINOR_DIGITS,
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_TONE,
  DEMO_CURRENCIES,
  DEMO_FX_PER_EUR,
  DEMO_REFERENCE_POOL,
  INDUSTRY_LABEL,
  PAYMENT_TERMS_LABEL,
  formatMoney,
  getEmployee,
  makeEmployees,
  type DemoCountryCode,
  type DemoCurrency,
  type DemoCustomerStatus,
  type DemoIndustry,
  type DemoPaymentTerms,
} from '../../../internal/demo-data';
import type { ListReportColumn, ListReportFilter } from '../../../list-report/types';
import { MessageStrip } from '../../../message-strip/MessageStrip';
import { ObjectPageSection } from '../../../object-page/ObjectPageSection';
import { Select } from '../../../select/Select';
import { StatusBadge } from '../../../status-badge/StatusBadge';
import { createCustomerStore, type StoredCustomer } from '../../customer-store';
import type { RecordHeaderActionsProps, RecordModule, RecordSectionsProps } from '../../record-module';
import { helpProps } from '../field-help';
import { CustomerContacts } from './CustomerContacts';
import { sameValues, toCustomer, toValues, validateCustomer, type AddressValues, type CustomerValues } from './customer-form';

export type { CustomerValues } from './customer-form';

// `position: relative`: the visually hidden status of the Combobox (and of the Selects) is absolutely positioned and
// must stay inside the scroller; without a positioned ancestor it would stretch the document below the page.
const COLUMN = { position: 'relative', display: 'grid', gap: 16, maxWidth: 420 } as const;
const ADDRESS_ROW = {
  display: 'grid',
  gap: 16,
  maxWidth: 420,
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
} as const;

/** Why every field of an archived customer is disabled: linked to each of them with `aria-describedby`. */
export const ARCHIVED_REASON = 'An archived customer cannot be edited: restore it first.';

/**
 * Why every field is disabled while a save that archives the customer is in flight (`lockWhileSaving`): an edit typed
 * then would survive the save on a customer that is archived by then, and its Save would write an archived customer.
 */
export const ARCHIVING_REASON = 'The customer is being archived: nothing can be changed until the save completes.';

const options = <K extends string>(labels: Readonly<Record<K, string>>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
const STATUS_OPTIONS = options(CUSTOMER_STATUS_LABEL);
const INDUSTRY_OPTIONS = options(INDUSTRY_LABEL);
const TERMS_OPTIONS = options(PAYMENT_TERMS_LABEL);
const CURRENCY_OPTIONS = DEMO_CURRENCIES.map((c) => ({ value: c, label: c }));
const COUNTRY_OPTIONS = (Object.keys(COUNTRY_NAME) as DemoCountryCode[])
  .map((code) => ({ value: code, label: COUNTRY_NAME[code] }))
  .sort((a, b) => a.label.localeCompare(b.label, 'en'));

// The employees an account can be given to: the sales staff of the demo company who still work there (the reference
// pool of the demo universe, where every account manager is). Someone who left is not offered for a new choice, but a
// customer still assigned to them keeps showing them (`unknownValueLabel`), never a bare id nor an empty field.
type ManagerOption = { value: string; label: string };
let managerOptions: ManagerOption[] | undefined;
export const accountManagerOptions = (): ManagerOption[] =>
  (managerOptions ??= makeEmployees(DEMO_REFERENCE_POOL.employees)
    .filter((e) => e.department === 'sales' && e.status !== 'inactive')
    .map((e) => ({ value: e.id, label: e.fullName }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en')));

/** The name of an account manager, also of one who left the company; the id itself when it is not an employee. */
export const accountManagerName = (id: string): string => getEmployee(id)?.fullName ?? id;

/** How an account manager who is not among the options (they left) is shown in the Combobox. */
const formerManagerLabel = (id: string): string => `${accountManagerName(id)} (left the company)`;

/** The sections of the customer page: the fields, as explicit JSX. */
function CustomerSections({ form, record, help, savingLock }: RecordSectionsProps<StoredCustomer, CustomerValues>) {
  const { values, setValue, setValues } = form;
  // Archived is the SAVED status, not the draft: choosing "Archived" locks nothing until it is saved. While the save
  // that archives is in flight everything is locked too (`savingLock`), so that once it lands the draft IS what was
  // saved: an archived customer never has unsaved edits that Save or Restore could write or drop.
  const archived = form.baseline.status === 'archived';
  const lockReason = archived ? ARCHIVED_REASON : savingLock;
  const state = lockReason ? ({ state: 'disabled', stateReason: lockReason } as const) : {};
  const baselineContactIds = useMemo(() => new Set(form.baseline.contacts.map((c) => c.id)), [form.baseline]);
  const address = values.billingAddress;
  // One nested object, one key of the form: an edit writes the whole address with the one part changed.
  const setAddress = (patch: Partial<AddressValues>) => setValue('billingAddress', { ...address, ...patch });
  const managers = accountManagerOptions();
  const managerListed = managers.some((m) => m.value === values.accountManagerId);
  return (
    <>
      <ObjectPageSection id="general" title="General">
        <div style={COLUMN}>
          {archived ? (
            // Static (no live region): the page loaded like this, nothing changed under the user.
            <MessageStrip tone="info" live={false} title="Archived customer">
              Its data cannot be changed. Use Restore, at the top of the page, to make it active again.
            </MessageStrip>
          ) : null}
          <Field
            label="Code"
            {...(lockReason
              ? ({ state: 'disabled', stateReason: lockReason } as const)
              : ({ state: 'locked', stateReason: 'The customer code is assigned by the system.' } as const))}
          >
            <Input value={record ? record.code : ''} readOnly />
          </Field>
          <Field label="Name" name="name" required {...state} {...helpProps(help, 'name')}>
            <Input value={values.name} onChange={(e) => setValue('name', e.target.value)} />
          </Field>
          <Field label="Industry" name="industry" {...state} {...helpProps(help, 'industry')}>
            <Select
              options={INDUSTRY_OPTIONS}
              emptyLabel="No options"
              value={values.industry}
              onValueChange={(v) => setValue('industry', v as DemoIndustry)}
            />
          </Field>
          <Field label="Status" name="status" {...state} {...helpProps(help, 'status')}>
            <Select
              options={STATUS_OPTIONS}
              emptyLabel="No options"
              value={values.status}
              onValueChange={(v) => setValue('status', v as DemoCustomerStatus)}
            />
          </Field>
        </div>
      </ObjectPageSection>
      <ObjectPageSection id="billing-address" title="Billing address">
        <div style={COLUMN}>
          <Field label="Street" name="billingAddress.line1" required {...state} {...helpProps(help, 'billingAddress.line1')}>
            <Input value={address.line1} onChange={(e) => setAddress({ line1: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Street, line 2" name="billingAddress.line2" {...state} {...helpProps(help, 'billingAddress.line2')}>
            <Input value={address.line2} onChange={(e) => setAddress({ line2: e.target.value })} autoComplete="off" />
          </Field>
          <div style={ADDRESS_ROW}>
            <Field label="Postal code" name="billingAddress.postalCode" required {...state} {...helpProps(help, 'billingAddress.postalCode')}>
              <Input value={address.postalCode} onChange={(e) => setAddress({ postalCode: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="City" name="billingAddress.city" required {...state} {...helpProps(help, 'billingAddress.city')}>
              <Input value={address.city} onChange={(e) => setAddress({ city: e.target.value })} autoComplete="off" />
            </Field>
          </div>
          <Field label="Region or state" name="billingAddress.region" {...state} {...helpProps(help, 'billingAddress.region')}>
            <Input value={address.region} onChange={(e) => setAddress({ region: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Country" name="billingAddress.country" {...state} {...helpProps(help, 'billingAddress.country')}>
            <Select
              options={COUNTRY_OPTIONS}
              emptyLabel="No countries"
              value={address.country}
              onValueChange={(v) => setAddress({ country: v as DemoCountryCode })}
            />
          </Field>
        </div>
      </ObjectPageSection>
      <ObjectPageSection id="contacts" title="Contacts">
        <CustomerContacts
          contacts={values.contacts}
          primaryContactId={values.primaryContactId}
          baselineIds={baselineContactIds}
          onChange={setValues}
          disabledReason={lockReason}
          listError={form.fieldErrors.contacts}
          fieldHelp={help}
        />
      </ObjectPageSection>
      <ObjectPageSection id="commercial-terms" title="Commercial terms">
        <div style={COLUMN}>
          <Field label="Currency" name="currency" {...state} {...helpProps(help, 'currency')}>
            <Select
              options={CURRENCY_OPTIONS}
              emptyLabel="No currencies"
              value={values.currency}
              onValueChange={(v) => setValue('currency', v as DemoCurrency)}
            />
          </Field>
          <Field label="Payment terms" name="paymentTerms" {...state} {...helpProps(help, 'paymentTerms')}>
            <Select
              options={TERMS_OPTIONS}
              emptyLabel="No options"
              value={values.paymentTerms}
              onValueChange={(v) => setValue('paymentTerms', v as DemoPaymentTerms)}
            />
          </Field>
          <Field label={`Credit limit (${values.currency})`} name="creditLimit" required {...state} {...helpProps(help, 'creditLimit')}>
            <Input
              inputMode={CURRENCY_MINOR_DIGITS[values.currency] === 0 ? 'numeric' : 'decimal'}
              value={values.creditLimit}
              onChange={(e) => setValue('creditLimit', e.target.value)}
            />
          </Field>
        </div>
      </ObjectPageSection>
      <ObjectPageSection id="account" title="Account">
        <div style={COLUMN}>
          <Field label="Account manager" name="accountManagerId" required {...state} {...helpProps(help, 'accountManagerId')}>
            <Combobox
              options={managers}
              value={values.accountManagerId || undefined}
              unknownValueLabel={values.accountManagerId && !managerListed ? formerManagerLabel(values.accountManagerId) : undefined}
              emptyLabel="No sales employee matches"
              onValueChange={(id) => {
                // `undefined` comes only with `clearOnEmpty` (not set: leaving an emptied text keeps the saved manager).
                // The check is for the type (`string | undefined`); without it the code does not compile.
                if (id !== undefined) setValue('accountManagerId', id);
              }}
            />
          </Field>
        </div>
      </ObjectPageSection>
    </>
  );
}

/**
 * "Restore", in the header of an archived customer (spec §1.9): pessimistic, the customer goes back to Active on the
 * server first, then the page takes what the server stored as its new baseline (`reset`, not an edit: the form stays
 * clean) and every field is enabled again. While the server works the button is `aria-disabled` ("Restoring…"); a
 * failure keeps the customer archived, says so and keeps the focus on the button. Once restored the button is gone:
 * the focus goes to the first field, "Name", and a live region says the customer was restored.
 */
function CustomerHeaderActions({ form, record, saveRecord }: RecordHeaderActionsProps<StoredCustomer, CustomerValues>) {
  const archived = form.baseline.status === 'archived';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [restored, setRestored] = useState(0);
  // The page the button belongs to, kept at the click: once restored the button is gone, the fields are still there.
  const scopeRef = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (restored === 0) return;
    scopeRef.current?.querySelector<HTMLElement>('[data-rop-name="name"]')?.focus();
  }, [restored]);
  // A Save that archived the customer (its saved status turned archived on this page, never at mount): said in the
  // same live region, since every field just became disabled under the user.
  const wasArchived = useRef(archived);
  useEffect(() => {
    if (archived && !wasArchived.current) setMessage({ error: false, text: `Customer ${record.code} archived.` });
    wasArchived.current = archived;
  }, [archived, record.code]);

  const restore = async (event: MouseEvent<HTMLButtonElement>) => {
    // `aria-disabled` does not block a click.
    if (busy || form.isSaving || !archived) return;
    scopeRef.current = event.currentTarget.closest<HTMLElement>('[data-object-page-scroller]');
    setBusy(true);
    setMessage(null);
    try {
      const stored = await saveRecord(toCustomer(record, { ...form.baseline, status: 'active' }));
      if (!mounted.current) return;
      form.reset(toValues(stored));
      setMessage({ error: false, text: `Customer ${stored.code} restored.` });
      setRestored((n) => n + 1);
    } catch {
      if (mounted.current) setMessage({ error: true, text: 'Could not restore the customer. Try again.' });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <>
      {archived ? (
        <Button variant="primary" onClick={restore} aria-disabled={busy || form.isSaving || undefined}>
          {busy ? 'Restoring…' : 'Restore'}
        </Button>
      ) : null}
      {/* Always mounted: the text changes after mount, so it is announced. The error is shown too. */}
      <span role="status" className={message?.error ? 'text-rop-error' : 'sr-only'}>
        {message?.text ?? ''}
      </span>
    </>
  );
}

/** What a column sorts a credit limit by: the amount in EUR, so a yen limit does not outweigh a euro one. */
const creditInEur = (r: StoredCustomer): number =>
  r.creditLimitMinor / 10 ** CURRENCY_MINOR_DIGITS[r.currency] / DEMO_FX_PER_EUR[r.currency];

const COLUMNS: readonly ListReportColumn<StoredCustomer>[] = [
  { id: 'code', header: 'Code', accessor: (r) => r.code, width: 130 },
  { id: 'name', header: 'Name', accessor: (r) => r.name, minWidth: 240 },
  { id: 'country', header: 'Country', accessor: (r) => COUNTRY_NAME[r.country], width: 150 },
  { id: 'accountManager', header: 'Account manager', accessor: (r) => accountManagerName(r.accountManagerId), width: 200 },
  {
    id: 'creditLimit',
    header: 'Credit limit',
    accessor: creditInEur,
    cell: (r) => formatMoney(r.creditLimitMinor, r.currency),
    align: 'end',
    firstSortDirection: 'desc',
    width: 160,
  },
  {
    id: 'status',
    header: 'Status',
    accessor: (r) => CUSTOMER_STATUS_LABEL[r.status],
    cell: (r) => <StatusBadge tone={CUSTOMER_STATUS_TONE[r.status]}>{CUSTOMER_STATUS_LABEL[r.status]}</StatusBadge>,
    width: 130,
  },
];

const FILTERS: readonly ListReportFilter<StoredCustomer>[] = [
  { id: 'all', label: 'All' },
  ...(Object.keys(CUSTOMER_STATUS_LABEL) as DemoCustomerStatus[]).map((status) => ({
    id: status,
    label: CUSTOMER_STATUS_LABEL[status],
    predicate: (r: StoredCustomer) => r.status === status,
  })),
];

/**
 * The search matches the code, the name and the city of the billing address (one text per row, the three on separate
 * lines so that no term matches across two of them), normalized like every List Report search (case and accents:
 * `munchen` finds München).
 */
export const customerSearchText = (r: StoredCustomer): string => `${r.code}\n${r.name}\n${r.billingAddress.city}`;

const LABELS = {
  loading: 'Loading…',
  empty: 'No customers',
  noResults: 'No results for the current filters',
  error: 'Could not load the customers',
  retry: 'Retry',
  clearFilters: 'Clear filters',
  resultCount: (count: number) => (count === 1 ? '1 result' : `${count} results`),
  count: (resultCount: number, totalCount: number) =>
    resultCount === totalCount ? `(${resultCount})` : `(${resultCount} of ${totalCount})`,
};

/**
 * The Customers module: list (200 customers), record page with the nested billing address, the contacts and the
 * account manager. The header shows the saved name and country and the saved status; an archived customer has
 * "Restore".
 */
export const CUSTOMERS: RecordModule<StoredCustomer, CustomerValues, never> = {
  name: 'customers',
  noun: { one: 'customer', many: 'customers' },
  createStore: () => createCustomerStore(),
  // The code: it never changes, so the title of an open page never disagrees with what was saved.
  recordName: (customer) => customer.code,
  list: { columns: COLUMNS, filters: FILTERS, linkColumn: 'code', labels: LABELS, getSearchText: customerSearchText },
  form: {
    toValues,
    isEqual: sameValues,
    validate: validateCustomer,
    toRecord: toCustomer,
    lockWhileSaving: (sent) => (sent.status === 'archived' ? ARCHIVING_REASON : undefined),
    subtitle: (saved) => `${saved.name} · ${COUNTRY_NAME[saved.billingAddress.country]}`,
    status: (saved) => <StatusBadge tone={CUSTOMER_STATUS_TONE[saved.status]}>{CUSTOMER_STATUS_LABEL[saved.status]}</StatusBadge>,
    Sections: CustomerSections,
    HeaderActions: CustomerHeaderActions,
  },
};
