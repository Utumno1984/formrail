import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Checkbox } from '../checkbox/Checkbox';
import {
  DEPARTMENT_LABEL,
  ENROLMENT_STATUS_LABEL,
  ENROLMENT_STATUS_TONE,
  PRODUCT_CATEGORY_LABEL,
  PURCHASE_ORDER_STATUS_LABEL,
  PURCHASE_ORDER_STATUS_TONE,
  SUPPORT_CASE_PRIORITY_LABEL,
  SUPPORT_CASE_PRIORITY_TONE,
  getSupplier,
  makeEmployees,
  makeEnrolments,
  makeProducts,
  makePurchaseOrders,
  makeSupportCases,
  type DemoEmployee,
  type DemoEnrolment,
  type DemoProduct,
  type DemoPurchaseOrder,
  type DemoSupportCase,
  type DemoSupportCasePriority,
} from '../internal/demo-data';
import { useCaseStory as describeUseCase } from '../internal/story-example';
import { storyControl } from '../internal/story-docs';
import { StatusBadge } from '../status-badge/StatusBadge';
import { ColumnsReport } from './ListReport.column-examples';
import type { ListReportColumn, ListReportSort, ListReportSortDirection } from './types';

// "Example: configured for ..." (ticket #627): six stories, one aspect of the column configuration each, on a
// different vertical, on the page of `Floorplans/List Report`. They live in their own file because the Docs
// page keeps the `use-case` stories after every neutral one (#624), file by file in the order of the paths: this
// file sorts after `ListReportCancelOverlay.stories.tsx`, the last neutral file of the page.

const meta: Meta = {
  title: 'Floorplans/List Report',
  parameters: { layout: 'fullscreen' },
};

export default meta;


const SORT_CALLBACK = { onSortChange: { control: false, table: { disable: true } } } as const;

/** An amount in minor units (cents, pence, yen) as money: `Intl` knows how many decimals the currency has. */
function formatMinor(minor: number, currency: string, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
}

/** An ISO date (`2026-06-12`) in the reader's locale. The date has no time zone, so format it in UTC. */
function formatDay(iso: string, locale: string, dateStyle: 'short' | 'medium' | 'long'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle, timeZone: 'UTC' }).format(new Date(iso));
}

const rowsOf = (canvas: ReturnType<typeof within>): HTMLElement[] => canvas.getAllByRole('row').slice(1);

/** Index of a column among the cells of a row (the selection checkbox column counts). */
const columnIndex = (canvas: ReturnType<typeof within>, name: string): number =>
  canvas.getAllByRole('columnheader').findIndex((header: HTMLElement) => header.textContent?.trim() === name);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- 1. ERP: defining the columns ------------------------------------------------------------------------

type PurchaseOrderColumnId = 'number' | 'supplier' | 'status';

interface ErpArgs {
  searchableColumns: PurchaseOrderColumnId[];
  onSortChange: (sort: ListReportSort) => void;
}

const PURCHASE_ORDERS = makePurchaseOrders(40);
const supplierName = (order: DemoPurchaseOrder): string => getSupplier(order.supplierId)?.name ?? order.supplierId;

function ErpPurchaseOrders({ searchableColumns, onSortChange }: ErpArgs) {
  const columns = useMemo<ListReportColumn<DemoPurchaseOrder>[]>(
    () => [
      // `id` is the stable key; `header` is what the reader sees; `accessor` is the raw value (sorting, search).
      { id: 'number', header: 'Order', accessor: (o) => o.number, searchable: searchableColumns.includes('number'), width: 200 },
      { id: 'supplier', header: 'Supplier', accessor: supplierName, searchable: searchableColumns.includes('supplier'), minWidth: 240 },
      {
        id: 'status',
        header: 'Status',
        accessor: (o) => PURCHASE_ORDER_STATUS_LABEL[o.status],
        // `cell` is only the rendering: the accessor above is still what is sorted and searched.
        cell: (o) => <StatusBadge tone={PURCHASE_ORDER_STATUS_TONE[o.status]}>{PURCHASE_ORDER_STATUS_LABEL[o.status]}</StatusBadge>,
        searchable: searchableColumns.includes('status'),
        width: 150,
      },
      {
        id: 'ordered',
        header: 'Ordered',
        accessor: (o) => o.orderDate,
        cell: (o) => formatDay(o.orderDate, 'en-GB', 'medium'),
        firstSortDirection: 'desc',
        searchable: false,
        width: 140,
      },
      {
        // The raw amount in minor units of the record's own currency: sorting does not convert between currencies.
        id: 'total',
        header: 'Total',
        accessor: (o) => o.totalMinor,
        cell: (o) => formatMinor(o.totalMinor, o.currency, 'en-GB'),
        align: 'end',
        searchable: false,
        width: 170,
      },
    ],
    [searchableColumns],
  );
  return <ColumnsReport title="Purchase orders" rows={PURCHASE_ORDERS} columns={columns} getRowId={(o) => o.id} onSortChange={onSortChange} />;
}

const searchbox = (canvas: ReturnType<typeof within>) => canvas.getByRole('searchbox', { name: 'Search' });

/**
 * Defining columns: `id` (stable key), `header`, `accessor` (the raw value, used to sort and search), `cell` (only
 * the rendering: here a status badge, a date and an amount in the currency of each order) and `searchable`
 * (`false` keeps a column out of the text search). The "Total" accessor returns the amount in minor units of the
 * order's own currency, so sorting is by amount in that currency, never converted. Controls: `searchableColumns`
 * (which columns the search looks into). The play function searches for the first order's supplier: with
 * "Supplier" searchable it finds the order, without it the search finds nothing while the order number still works.
 */
export const UseCaseErpPurchaseOrder: StoryObj<ErpArgs> = {
  name: 'Example: configured for an ERP purchase-order list',
  tags: ['use-case', 'vertical:erp', 'visual'],
  ...describeUseCase({
    vertical: 'erp',
    problem: 'A buyer finds purchase orders by number or supplier, and sorts them by total even though each order is in its supplier\'s currency.',
    configuration:
      'Each column has an `id`, a `header`, an `accessor` with the raw value (the number, the supplier name, the amount in minor units) and, where the display differs, a `cell` (badge, date, money). `searchable: false` keeps the date and the amount out of the search; the Controls decide whether the supplier and the status are searched too.',
  }),
  argTypes: {
    searchableColumns: storyControl({
      control: 'check',
      options: ['number', 'supplier', 'status'],
      description: '`searchable` of the "Order", "Supplier" and "Status" columns: `false` on a column keeps it out of the text search',
    }),
    ...SORT_CALLBACK,
  },
  args: { searchableColumns: ['number', 'supplier'], onSortChange: fn() },
  render: (args) => <ErpPurchaseOrders {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const first = PURCHASE_ORDERS[0]!;
    const term = supplierName(first).split(' ')[0]!;
    await waitFor(() => expect(rowsOf(canvas).length).toBe(PURCHASE_ORDERS.length));
    const search = async (text: string) => {
      await userEvent.clear(searchbox(canvas));
      await userEvent.type(searchbox(canvas), `${text}{Enter}`);
    };
    const expectedWithSupplier = PURCHASE_ORDERS.filter((o) => supplierName(o).includes(term)).length;
    await expect(expectedWithSupplier).toBeGreaterThan(0);
    await search(term);
    if (args.searchableColumns.includes('supplier')) {
      await waitFor(() => expect(rowsOf(canvas)).toHaveLength(expectedWithSupplier));
      await expect(rowsOf(canvas)[0]).toHaveTextContent(supplierName(first));
    } else {
      const table = within(canvas.getByRole('table', { name: 'Purchase orders' }));
      await waitFor(() => expect(table.getByText('No results for the current filters')).toBeVisible());
      await expect(table.queryByText(supplierName(first))).toBeNull();
      // The other searchable column still works.
      if (args.searchableColumns.includes('number')) {
        await search(first.number);
        await waitFor(() => expect(rowsOf(canvas)).toHaveLength(1));
      }
    }
  },
};

// ---- 2. E-commerce: width and truncation ------------------------------------------------------------------

/** Strings, so that a URL arg (`?args=nameWidth:18rem`) keeps its type; the story turns `240` into a number of px. */
type NameWidth = 'auto' | '240' | '18rem';

interface CatalogueArgs {
  nameWidth: NameWidth;
  truncate: boolean;
  onSortChange: (sort: ListReportSort) => void;
}

const PRODUCTS = makeProducts(40);

function ProductCatalogue({ nameWidth, truncate, onSortChange }: CatalogueArgs) {
  const columns = useMemo<ListReportColumn<DemoProduct>[]>(
    () => [
      // A fixed width in px: an SKU never changes length.
      { id: 'sku', header: 'SKU', accessor: (p) => p.sku, width: 130 },
      {
        id: 'name',
        header: 'Product',
        accessor: (p) => p.name,
        // `width` takes px or any CSS length; without one the column shares the free space. `minWidth` counts
        // in the table's minimum width, so a narrow container scrolls instead of squeezing the name.
        width: nameWidth === 'auto' ? undefined : /^\d+$/.test(nameWidth) ? Number(nameWidth) : nameWidth,
        minWidth: 160,
        // `true` (default): one line with an ellipsis and a tooltip with the full text on hover or focus.
        truncate,
      },
      { id: 'category', header: 'Category', accessor: (p) => PRODUCT_CATEGORY_LABEL[p.category], width: 170 },
      {
        id: 'price',
        header: 'Price',
        accessor: (p) => p.listPriceMinor.EUR,
        cell: (p) => formatMinor(p.listPriceMinor.EUR, 'EUR', 'en-GB'),
        align: 'end',
        searchable: false,
        width: 120,
      },
    ],
    [nameWidth, truncate],
  );
  return <ColumnsReport title="Products" rows={PRODUCTS} columns={columns} getRowId={(p) => p.id} onSortChange={onSortChange} />;
}

/**
 * Width and truncation: `width` (a number in px, or a CSS length such as `18rem`; without one the column shares
 * the free space), `minWidth` (counted in the minimum width of the table, so a narrow container scrolls) and
 * `truncate` (one line with an ellipsis, or wrapped). The SKU has a fixed width, the product name is long.
 * Controls: `nameWidth`, `truncate`. The play function checks the header width the Control asked for, then, with
 * `truncate` on, that the name is cut (`scrollWidth > clientWidth`) inside a real `max-width`, with no tooltip at
 * mount and the full text in a tooltip on hover; with `truncate` off, that the name wraps and opens no tooltip.
 */
export const UseCaseEcommerceProductCatalogue: StoryObj<CatalogueArgs> = {
  name: 'Example: configured for an e-commerce product catalogue',
  tags: ['use-case', 'vertical:e-commerce', 'visual'],
  ...describeUseCase({
    vertical: 'e-commerce',
    problem: 'Product names run past 50 characters while the SKU and the price are short; the table has to keep its rows one line high on a phone.',
    configuration:
      'The SKU gets a fixed `width` in px, the name a `width` of `240` or `18rem` (or none, to take the free space) with a `minWidth` of 160, and `truncate` (the default) keeps it to one line with a tooltip. `truncate: false` lets the name wrap, and the row grows.',
  }),
  argTypes: {
    nameWidth: storyControl({
      control: 'select',
      options: ['auto', '240', '18rem'],
      description: '`width` of the "Product" column: none (it takes the free space), 240 (px) or `18rem`',
    }),
    truncate: storyControl({ control: 'boolean', description: '`truncate` of the "Product" column: an ellipsis and a tooltip, or wrapped text' }),
    ...SORT_CALLBACK,
  },
  args: { nameWidth: '240', truncate: true, onSortChange: fn() },
  render: (args) => <ProductCatalogue {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(PRODUCTS.length));
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const header = canvas.getByRole('columnheader', { name: 'Product' });
    const width = header.getBoundingClientRect().width;
    // `minWidth` is 160: a `rem` width is never narrower than it.
    await expect(width).toBeGreaterThanOrEqual(160 - 1);
    if (args.nameWidth !== 'auto') {
      const wanted = Number.parseFloat(args.nameWidth) * (args.nameWidth.endsWith('rem') ? rem : 1);
      await expect(Math.abs(width - wanted)).toBeLessThanOrEqual(1);
    } else {
      await expect(width).toBeGreaterThan(240);
      return;
    }
    const nameIndex = columnIndex(canvas, 'Product');
    const longest = [...PRODUCTS].sort((a, b) => b.name.length - a.name.length)[0]!;
    const row = rowsOf(canvas)[PRODUCTS.indexOf(longest)]!;
    const cell = within(row).getAllByRole('cell')[nameIndex]!;
    // Nothing yet: the tooltip is judged at the gesture, never at mount.
    await expect(body.queryByRole('tooltip')).toBeNull();
    if (args.truncate) {
      const text = cell.firstElementChild as HTMLElement;
      await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth);
      await expect(getComputedStyle(text).maxWidth).not.toBe('none');
      await userEvent.hover(text);
      await waitFor(() => expect(body.getByRole('tooltip')).toHaveTextContent(longest.name), { timeout: 3000 });
      await userEvent.unhover(text);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(body.queryByRole('tooltip')).toBeNull());
    } else {
      const shortest = [...PRODUCTS].sort((a, b) => a.name.length - b.name.length)[0]!;
      const shortRow = rowsOf(canvas)[PRODUCTS.indexOf(shortest)]!;
      await expect(row.getBoundingClientRect().height).toBeGreaterThan(shortRow.getBoundingClientRect().height);
      await expect(cell).toHaveTextContent(longest.name);
      await userEvent.hover(cell);
      await sleep(900);
      await expect(body.queryByRole('tooltip')).toBeNull();
      await userEvent.unhover(cell);
    }
  },
};

// ---- 3. B2B: right-aligned numbers and currency ------------------------------------------------------------

type PriceCurrency = 'EUR' | 'USD' | 'GBP' | 'JPY';
type PriceLocale = 'en-GB' | 'de-DE' | 'ja-JP';

interface PriceListArgs {
  currency: PriceCurrency;
  locale: PriceLocale;
  onSortChange: (sort: ListReportSort) => void;
}

function PriceList({ currency, locale, onSortChange }: PriceListArgs) {
  const columns = useMemo<ListReportColumn<DemoProduct>[]>(
    () => [
      { id: 'sku', header: 'SKU', accessor: (p) => p.sku, width: 130 },
      { id: 'name', header: 'Product', accessor: (p) => p.name, minWidth: 240 },
      {
        id: 'price',
        header: `List price (${currency})`,
        // Sorting is on the raw number, never on the formatted text.
        accessor: (p) => p.listPriceMinor[currency],
        // Numbers line up on the right; `Intl.NumberFormat` knows that EUR has two decimals and JPY none.
        cell: (p) => formatMinor(p.listPriceMinor[currency], currency, locale),
        align: 'end',
        searchable: false,
        width: 190,
      },
    ],
    [currency, locale],
  );
  return <ColumnsReport title="Price list" rows={PRODUCTS} columns={columns} getRowId={(p) => p.id} onSortChange={onSortChange} />;
}

/** The characters of an amount that are not digits, as the reader sees them. */
const decimalSeparatorOf = (locale: string): string =>
  new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')!.value;

/**
 * Right-aligned numbers and money: `align: 'end'` puts the header and the cells of the price column on the
 * right, and `cell` formats the raw amount with `Intl.NumberFormat` (`style: 'currency'`): two decimals in EUR,
 * USD and GBP, none in JPY, and the separators of the reader's locale. The `accessor` stays the number, so
 * the column sorts by value. Controls: `currency`, `locale`. The play function checks the alignment of the header
 * and of the cells, that a JPY price has no decimal digits while the others have two, and that the decimal
 * separator is the one of the locale.
 */
export const UseCaseB2bPriceList: StoryObj<PriceListArgs> = {
  name: 'Example: configured for a B2B price list',
  tags: ['use-case', 'vertical:b2b', 'visual'],
  ...describeUseCase({
    vertical: 'b2b',
    problem: 'A buyer compares list prices in the currency of the contract, and reads them in the format of their own country.',
    configuration:
      '`align: \'end\'` on the price column (header and cells), `accessor` returning the number, and a `cell` that formats it with `Intl.NumberFormat(locale, { style: \'currency\', currency })`. Changing the currency or the locale changes only the `cell`: the sort order and the layout stay.',
  }),
  argTypes: {
    currency: storyControl({ control: 'radio', options: ['EUR', 'USD', 'GBP', 'JPY'], description: 'Currency of the price column: its `accessor` and the `currency` of its `Intl.NumberFormat`' }),
    locale: storyControl({ control: 'select', options: ['en-GB', 'de-DE', 'ja-JP'], description: 'Locale of the `Intl.NumberFormat` in the `cell`: separators and the place of the symbol' }),
    ...SORT_CALLBACK,
  },
  args: { currency: 'EUR', locale: 'en-GB', onSortChange: fn() },
  render: (args) => <PriceList {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(PRODUCTS.length));
    const header = canvas.getByRole('columnheader', { name: `List price (${args.currency})` });
    await expect(getComputedStyle(header).textAlign).toMatch(/^(end|right)$/);
    const index = columnIndex(canvas, `List price (${args.currency})`);
    const cells = rowsOf(canvas).map((row) => within(row).getAllByRole('cell')[index]!);
    for (const cell of cells) await expect(getComputedStyle(cell).textAlign).toMatch(/^(end|right)$/);
    const prices = PRODUCTS.map((p) => p.listPriceMinor[args.currency]);
    // The digits on screen are the amount: in JPY the minor unit is the yen, in the others the amount has two decimals.
    const digits = (text: string) => text.replace(/\D/g, '');
    for (const [i, cell] of cells.entries()) await expect(digits(cell.textContent ?? '')).toBe(String(prices[i]));
    const sample = cells[0]!.textContent ?? '';
    const separator = decimalSeparatorOf(args.locale);
    if (args.currency === 'JPY') {
      // No decimal part: the last group is never one or two digits after a separator.
      await expect(sample).not.toMatch(/[.,]\d{1,2}(?!\d)/);
    } else {
      await expect(sample).toMatch(new RegExp(`\\${separator}\\d{2}(?!\\d)`));
    }
    // The price column still sorts by number: the first click goes ascending.
    await userEvent.click(canvas.getByRole('button', { name: `List price (${args.currency})` }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'price', direction: 'asc' });
    const sorted = within(rowsOf(canvas)[0]!).getAllByRole('cell')[index]!.textContent ?? '';
    await expect(digits(sorted)).toBe(String(Math.min(...prices)));
  },
};

// ---- 4. E-learning: dates and status -----------------------------------------------------------------------

type EnrolmentDateStyle = 'short' | 'medium' | 'long';
type EnrolmentLocale = 'en-GB' | 'de-DE' | 'ja-JP';

interface EnrolmentArgs {
  dateStyle: EnrolmentDateStyle;
  locale: EnrolmentLocale;
  onSortChange: (sort: ListReportSort) => void;
}

const ENROLMENTS = makeEnrolments(40);

/** A missing value shown as a dash that a screen reader announces as what is missing (spec 1.13.1). */
function Absent({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label}>
      —
    </span>
  );
}

function CourseEnrolments({ dateStyle, locale, onSortChange }: EnrolmentArgs) {
  const columns = useMemo<ListReportColumn<DemoEnrolment>[]>(
    () => [
      { id: 'learner', header: 'Learner', accessor: (e) => e.learner.name, minWidth: 200 },
      {
        id: 'status',
        header: 'Status',
        accessor: (e) => ENROLMENT_STATUS_LABEL[e.status],
        cell: (e) => <StatusBadge tone={ENROLMENT_STATUS_TONE[e.status]}>{ENROLMENT_STATUS_LABEL[e.status]}</StatusBadge>,
        searchable: false,
        width: 150,
      },
      {
        id: 'enrolled',
        header: 'Enrolled',
        accessor: (e) => e.enrolledOn,
        cell: (e) => formatDay(e.enrolledOn, locale, dateStyle),
        searchable: false,
        width: 170,
      },
      {
        id: 'completed',
        header: 'Completed',
        // An empty value sorts last; the cell says what is missing instead of leaving a bare dash.
        accessor: (e) => e.completedOn,
        cell: (e) => (e.completedOn ? formatDay(e.completedOn, locale, dateStyle) : <Absent label="Not completed" />),
        searchable: false,
        width: 170,
      },
      {
        id: 'score',
        header: 'Score',
        accessor: (e) => e.score,
        cell: (e) => (e.score === null ? <Absent label="No score" /> : `${e.score}%`),
        align: 'end',
        searchable: false,
        width: 110,
      },
    ],
    [dateStyle, locale],
  );
  return <ColumnsReport title="Enrolments" rows={ENROLMENTS} columns={columns} getRowId={(e) => e.id} onSortChange={onSortChange} />;
}

/**
 * Dates and status: `cell` formats an ISO date with `Intl.DateTimeFormat` (`dateStyle`, in the reader's
 * locale) and shows the state as a `StatusBadge` whose tone comes from a map. A missing completion date or score
 * is a dash with an accessible name ("Not completed", "No score"), never an empty cell or a zero: it is not the
 * same as 0%. Controls: `dateStyle`, `locale`. The play function finds a withdrawn enrolment (dash named "Not
 * completed", badge "Withdrawn") and a completed one, and checks its date against `Intl.DateTimeFormat` for the
 * Controls' `dateStyle` and `locale`.
 */
export const UseCaseElearningEnrolments: StoryObj<EnrolmentArgs> = {
  name: 'Example: configured for e-learning enrolments',
  tags: ['use-case', 'vertical:e-learning', 'visual'],
  ...describeUseCase({
    vertical: 'e-learning',
    problem: 'A learning manager reads when each person enrolled and finished a course, in their own date format, and tells a withdrawn learner from one who has not finished yet.',
    configuration:
      '`cell` with `Intl.DateTimeFormat(locale, { dateStyle })` for the dates (the `accessor` keeps the ISO string, so it sorts by date), a `StatusBadge` with the tone of the status, and an `Absent` dash with an accessible name for a missing completion date or score.',
  }),
  argTypes: {
    dateStyle: storyControl({ control: 'radio', options: ['short', 'medium', 'long'], description: '`dateStyle` of the `Intl.DateTimeFormat` in the date cells' }),
    locale: storyControl({ control: 'select', options: ['en-GB', 'de-DE', 'ja-JP'], description: 'Locale of the `Intl.DateTimeFormat` in the date cells' }),
    ...SORT_CALLBACK,
  },
  args: { dateStyle: 'medium', locale: 'en-GB', onSortChange: fn() },
  render: (args) => <CourseEnrolments {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(ENROLMENTS.length));
    const withdrawn = ENROLMENTS.findIndex((e) => e.status === 'withdrawn');
    const completed = ENROLMENTS.findIndex((e) => e.completedOn !== null);
    await expect(withdrawn).toBeGreaterThanOrEqual(0);
    await expect(completed).toBeGreaterThanOrEqual(0);
    const cellsOf = (index: number) => within(rowsOf(canvas)[index]!).getAllByRole('cell');
    const completedIndex = columnIndex(canvas, 'Completed');
    const scoreIndex = columnIndex(canvas, 'Score');
    const statusIndex = columnIndex(canvas, 'Status');

    const gone = cellsOf(withdrawn);
    await expect(within(gone[completedIndex]!).getByRole('img', { name: 'Not completed' })).toHaveTextContent('—');
    await expect(within(gone[scoreIndex]!).getByRole('img', { name: 'No score' })).toBeVisible();
    await expect(gone[statusIndex]).toHaveTextContent(ENROLMENT_STATUS_LABEL.withdrawn);

    const done = cellsOf(completed);
    const record = ENROLMENTS[completed]!;
    await expect(done[statusIndex]).toHaveTextContent(ENROLMENT_STATUS_LABEL.completed);
    await expect(done[completedIndex]).toHaveTextContent(formatDay(record.completedOn!, args.locale, args.dateStyle));
    await expect(within(done[completedIndex]!).queryByRole('img', { name: 'Not completed' })).toBeNull();
    await expect(done[scoreIndex]).toHaveTextContent(`${record.score}%`);
  },
};

// ---- 5. HR: hidden and optional columns --------------------------------------------------------------------

type OptionalColumnId = 'department' | 'manager' | 'hired';
const OPTIONAL_COLUMNS: readonly { id: OptionalColumnId; label: string }[] = [
  { id: 'department', label: 'Department' },
  { id: 'manager', label: 'Manager' },
  { id: 'hired', label: 'Hire date' },
];

interface DirectoryArgs {
  visibleColumns: OptionalColumnId[];
  onSortChange: (sort: ListReportSort) => void;
}

const EMPLOYEES = makeEmployees(40);
const EMPLOYEE_BY_ID = new Map(EMPLOYEES.map((e) => [e.id, e]));
const managerName = (e: DemoEmployee): string => (e.managerId ? (EMPLOYEE_BY_ID.get(e.managerId)?.fullName ?? '') : '');

/** The consumer's recipe: a checkbox group picks the optional columns and the `columns` array is filtered, memoized. */
function EmployeeDirectory({ visibleColumns, onSortChange }: DirectoryArgs) {
  const [visible, setVisible] = useState<readonly OptionalColumnId[]>(visibleColumns);
  const columns = useMemo<ListReportColumn<DemoEmployee>[]>(() => {
    const all: (ListReportColumn<DemoEmployee> & { optional?: OptionalColumnId })[] = [
      { id: 'name', header: 'Name', accessor: (e) => e.fullName, minWidth: 200 },
      { id: 'title', header: 'Title', accessor: (e) => e.title, minWidth: 200 },
      { id: 'department', header: 'Department', accessor: (e) => DEPARTMENT_LABEL[e.department], width: 170, optional: 'department' },
      { id: 'manager', header: 'Manager', accessor: managerName, minWidth: 180, optional: 'manager' },
      {
        id: 'hired',
        header: 'Hire date',
        accessor: (e) => e.hireDate,
        cell: (e) => formatDay(e.hireDate, 'en-GB', 'medium'),
        searchable: false,
        width: 150,
        optional: 'hired',
      },
    ];
    // A column without `optional` is always there; the others only while their box is checked.
    return all.filter((column) => !column.optional || visible.includes(column.optional));
  }, [visible]);
  const toolbar = (
    <fieldset style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: 0, border: 0, padding: 0 }}>
      <legend style={{ marginBottom: 4 }}>Optional columns</legend>
      {OPTIONAL_COLUMNS.map(({ id, label }) => (
        <Checkbox
          key={id}
          checked={visible.includes(id)}
          onCheckedChange={(checked) => setVisible((now) => (checked ? [...now, id] : now.filter((c) => c !== id)))}
        >
          {label}
        </Checkbox>
      ))}
    </fieldset>
  );
  return (
    <ColumnsReport
      title="Employees"
      rows={EMPLOYEES}
      columns={columns}
      getRowId={(e) => e.id}
      onSortChange={onSortChange}
      selectable
      toolbar={toolbar}
    />
  );
}

/**
 * Hidden or optional columns, with no API of their own: the consumer keeps the optional columns in state (here a
 * `Checkbox` group), filters its `columns` array and memoizes the result. A column that is not in the array is
 * not drawn, not searched and not sortable; sorting and selection keep working on the others. Controls:
 * `visibleColumns` (the initial choice; the checkboxes change it from then on). The play function makes sure
 * "Manager" is on, searches the CEO's name (found in every report of the CEO and in the CEO's own row), unchecks
 * "Manager" (the header goes and the same search finds only the CEO's own row), then sorts by "Hire date" and
 * selects a row.
 */
export const UseCaseHrEmployeeDirectory: StoryObj<DirectoryArgs> = {
  name: 'Example: configured for an HR employee directory (optional columns)',
  tags: ['use-case', 'vertical:hr', 'visual'],
  ...describeUseCase({
    vertical: 'hr',
    problem: 'People pick what they need to see in a directory: some want the manager and the hire date, others only the name and the title.',
    configuration:
      'A `Checkbox` group for the optional columns and a memoized `columns` array filtered by it (`useMemo` on the chosen ids). The required columns are always in the array, so with every box unchecked the table keeps its name and title.',
  }),
  argTypes: {
    visibleColumns: storyControl({
      control: 'check',
      options: ['department', 'manager', 'hired'],
      description: 'The optional columns in the `columns` array at the start: the consumer filters the array, the component has no such prop',
    }),
    ...SORT_CALLBACK,
  },
  args: { visibleColumns: ['department', 'manager', 'hired'], onSortChange: fn() },
  render: (args) => <EmployeeDirectory key={args.visibleColumns.join()} {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(EMPLOYEES.length));
    const box = (name: string) => canvas.getByRole('checkbox', { name }) as HTMLInputElement;
    if (!box('Manager').checked) await userEvent.click(box('Manager'));
    await expect(canvas.getByRole('columnheader', { name: 'Manager' })).toBeVisible();

    const ceo = EMPLOYEES[0]!;
    const term = ceo.lastName;
    const withManager = EMPLOYEES.filter((e) => e.fullName.includes(term) || managerName(e).includes(term)).length;
    await expect(withManager).toBeGreaterThan(1);
    await userEvent.type(searchbox(canvas), `${term}{Enter}`);
    await waitFor(() => expect(rowsOf(canvas)).toHaveLength(withManager));

    await userEvent.click(box('Manager'));
    await expect(canvas.queryByRole('columnheader', { name: 'Manager' })).toBeNull();
    // Required columns stay; the search now looks only into the columns that are there.
    await expect(canvas.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(canvas.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    const withoutManager = EMPLOYEES.filter((e) => e.fullName.includes(term) || e.title.includes(term)).length;
    await expect(withoutManager).toBeLessThan(withManager);
    await waitFor(() => expect(rowsOf(canvas)).toHaveLength(withoutManager));

    // Sorting and selection still work on the other columns.
    await userEvent.clear(searchbox(canvas));
    await userEvent.type(searchbox(canvas), '{Enter}');
    await waitFor(() => expect(rowsOf(canvas)).toHaveLength(EMPLOYEES.length));
    if (box('Hire date').checked) {
      await userEvent.click(canvas.getByRole('button', { name: 'Hire date' }));
      await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'hired', direction: 'asc' });
      await expect(canvas.getByRole('columnheader', { name: 'Hire date' })).toHaveAttribute('aria-sort', 'ascending');
    }
    await userEvent.click(canvas.getByRole('checkbox', { name: `Select ${EMPLOYEES[0]!.fullName}` }));
    await expect(canvas.getByText('1 selected')).toBeVisible();
  },
};

// ---- 6. Helpdesk: sorting -----------------------------------------------------------------------------------

type CaseSortChoice = 'none' | 'priority' | 'opened' | 'sla';

interface QueueArgs {
  defaultSort: CaseSortChoice;
  priorityFirstDirection: ListReportSortDirection;
  onSortChange: (sort: ListReportSort) => void;
}

const SUPPORT_CASES = makeSupportCases(40);
/** Urgent above high above normal above low: an order the alphabet does not give. */
const PRIORITY_RANK: Readonly<Record<DemoSupportCasePriority, number>> = { low: 0, normal: 1, high: 2, urgent: 3 };

function SupportQueue({ defaultSort, priorityFirstDirection, onSortChange }: QueueArgs) {
  const columns = useMemo<ListReportColumn<DemoSupportCase>[]>(
    () => [
      { id: 'number', header: 'Case', accessor: (c) => c.number, width: 130 },
      // `sortable: false`: a free-text subject has no useful order, so it has no sort button.
      { id: 'subject', header: 'Subject', accessor: (c) => c.subject, sortable: false, minWidth: 260 },
      {
        id: 'priority',
        header: 'Priority',
        accessor: (c) => SUPPORT_CASE_PRIORITY_LABEL[c.priority],
        // The alphabet would put "High" before "Urgent" and "Low" before "Normal": compare by rank instead.
        compare: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
        cell: (c) => <StatusBadge tone={SUPPORT_CASE_PRIORITY_TONE[c.priority]}>{SUPPORT_CASE_PRIORITY_LABEL[c.priority]}</StatusBadge>,
        firstSortDirection: priorityFirstDirection,
        searchable: false,
        width: 130,
      },
      {
        // The first click shows the newest case; sorting is on the ISO string, which orders as a date.
        id: 'opened',
        header: 'Opened',
        accessor: (c) => c.openedOn,
        cell: (c) => formatDay(c.openedOn, 'en-GB', 'medium'),
        firstSortDirection: 'desc',
        searchable: false,
        width: 140,
      },
      {
        // The first click shows the case that is due first.
        id: 'sla',
        header: 'Reply due',
        accessor: (c) => c.slaDueDate,
        cell: (c) => formatDay(c.slaDueDate, 'en-GB', 'medium'),
        firstSortDirection: 'asc',
        searchable: false,
        width: 140,
      },
    ],
    [priorityFirstDirection],
  );
  const initial = useMemo<ListReportSort>(() => {
    if (defaultSort === 'none') return null;
    const direction = defaultSort === 'priority' ? priorityFirstDirection : defaultSort === 'opened' ? 'desc' : 'asc';
    return { columnId: defaultSort === 'sla' ? 'sla' : defaultSort, direction };
  }, [defaultSort, priorityFirstDirection]);
  return <ColumnsReport title="Support cases" rows={SUPPORT_CASES} columns={columns} getRowId={(c) => c.id} defaultSort={initial} onSortChange={onSortChange} />;
}

/**
 * Sorting: `compare` replaces the default comparator (the priority has an order of its own, not the alphabet),
 * `firstSortDirection` chooses what the first click does (newest first on "Opened", earliest due first on
 * "Reply due", the Control's choice on "Priority") and `sortable: false` removes the button from "Subject".
 * Controls: `defaultSort` (the sort at mount), `priorityFirstDirection`. The play function clicks "Priority"
 * (the top row is the most urgent, or the least with `asc`), "Opened" (the newest on top) and "Reply due" (the
 * earliest on top), and checks that "Subject" has no sort button.
 */
export const UseCaseHelpdeskSupportQueue: StoryObj<QueueArgs> = {
  name: 'Example: configured for a helpdesk support queue',
  tags: ['use-case', 'vertical:helpdesk', 'visual'],
  ...describeUseCase({
    vertical: 'helpdesk',
    problem: 'A support lead wants the urgent cases first, then the newest, then the ones about to breach their reply time; the priority names do not sort in that order alphabetically.',
    configuration:
      '`compare` on the priority column ranks urgent > high > normal > low, `firstSortDirection: \'desc\'` on the opening date and `\'asc\'` on the reply-due date make the first click useful, and `sortable: false` on the subject leaves it without a sort button.',
  }),
  argTypes: {
    defaultSort: storyControl({
      control: 'select',
      options: ['none', 'priority', 'opened', 'sla'],
      description: '`defaultSort` of `useListReport`: the column sorted at mount, in the direction of its first click',
    }),
    priorityFirstDirection: storyControl({ control: 'radio', options: ['asc', 'desc'], description: '`firstSortDirection` of the "Priority" column: what the first click does' }),
    ...SORT_CALLBACK,
  },
  args: { defaultSort: 'none', priorityFirstDirection: 'desc', onSortChange: fn() },
  render: (args) => <SupportQueue key={`${args.defaultSort}-${args.priorityFirstDirection}`} {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(SUPPORT_CASES.length));
    const top = (column: string) => within(rowsOf(canvas)[0]!).getAllByRole('cell')[columnIndex(canvas, column)]!;
    await expect(canvas.queryByRole('button', { name: 'Subject' })).toBeNull();
    await expect(canvas.getByRole('columnheader', { name: 'Subject' })).toBeVisible();

    if (args.defaultSort !== 'none') {
      const mounted = { priority: ['Priority', args.priorityFirstDirection], opened: ['Opened', 'desc'], sla: ['Reply due', 'asc'] }[args.defaultSort];
      await expect(canvas.getByRole('columnheader', { name: mounted[0]! })).toHaveAttribute('aria-sort', mounted[1] === 'asc' ? 'ascending' : 'descending');
      return;
    }
    const ranks = SUPPORT_CASES.map((c) => PRIORITY_RANK[c.priority]);
    const wanted = args.priorityFirstDirection === 'desc' ? Math.max(...ranks) : Math.min(...ranks);
    const wantedPriority = SUPPORT_CASES.find((c) => PRIORITY_RANK[c.priority] === wanted)!.priority;
    await userEvent.click(canvas.getByRole('button', { name: 'Priority' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'priority', direction: args.priorityFirstDirection });
    await expect(top('Priority')).toHaveTextContent(SUPPORT_CASE_PRIORITY_LABEL[wantedPriority]);

    await userEvent.click(canvas.getByRole('button', { name: 'Opened' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'opened', direction: 'desc' });
    const newest = SUPPORT_CASES.map((c) => c.openedOn).sort().at(-1)!;
    await expect(top('Opened')).toHaveTextContent(formatDay(newest, 'en-GB', 'medium'));

    await userEvent.click(canvas.getByRole('button', { name: 'Reply due' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'sla', direction: 'asc' });
    const earliest = SUPPORT_CASES.map((c) => c.slaDueDate).sort()[0]!;
    await expect(top('Reply due')).toHaveTextContent(formatDay(earliest, 'en-GB', 'medium'));
  },
};

// Fixtures for the e2e (`e2e/list-report-column-examples.spec.ts`): each example without its play, so a test
// starts from the state the Controls give and not from where the play left the table. Hidden from the sidebar
// and the visual baselines; still `use-case` stories, so the guard of the Docs pages reads their vertical.
export const UseCaseErpPurchaseOrderNoPlay: StoryObj<ErpArgs> = { ...UseCaseErpPurchaseOrder, name: 'Example: configured for an ERP purchase-order list (no play)', tags: ['use-case', 'vertical:erp', 'internal'], play: undefined };
export const UseCaseEcommerceProductCatalogueNoPlay: StoryObj<CatalogueArgs> = {
  ...UseCaseEcommerceProductCatalogue,
  name: 'Example: configured for an e-commerce product catalogue (no play)',
  tags: ['use-case', 'vertical:e-commerce', 'internal'],
  play: undefined,
};
export const UseCaseB2bPriceListNoPlay: StoryObj<PriceListArgs> = { ...UseCaseB2bPriceList, name: 'Example: configured for a B2B price list (no play)', tags: ['use-case', 'vertical:b2b', 'internal'], play: undefined };
export const UseCaseElearningEnrolmentsNoPlay: StoryObj<EnrolmentArgs> = {
  ...UseCaseElearningEnrolments,
  name: 'Example: configured for e-learning enrolments (no play)',
  tags: ['use-case', 'vertical:e-learning', 'internal'],
  play: undefined,
};
export const UseCaseHrEmployeeDirectoryNoPlay: StoryObj<DirectoryArgs> = {
  ...UseCaseHrEmployeeDirectory,
  name: 'Example: configured for an HR employee directory (optional columns) (no play)',
  tags: ['use-case', 'vertical:hr', 'internal'],
  play: undefined,
};
export const UseCaseHelpdeskSupportQueueNoPlay: StoryObj<QueueArgs> = {
  ...UseCaseHelpdeskSupportQueue,
  name: 'Example: configured for a helpdesk support queue (no play)',
  tags: ['use-case', 'vertical:helpdesk', 'internal'],
  play: undefined,
};
