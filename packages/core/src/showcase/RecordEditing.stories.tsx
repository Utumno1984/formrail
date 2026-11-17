import { useEffect, useLayoutEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { formatMoney } from '../internal/demo-data';
import { githubSource, showcaseFiles, showcaseSource } from '../internal/story-example';
import { storyControls } from '../internal/story-docs';
import { SALES_ORDERS, SALES_ORDERS_CRUD } from './modules/sales-orders/sales-orders-module';
import { RecordCrud } from './RecordCrud';
import { RecordPage } from './RecordPageShell';
import {
  createSalesOrderStore,
  type LoadOutcome,
  type SaveOutcome,
  type StoredSalesOrder,
} from './sales-order-store';
import {
  CRUD_ARGS,
  CRUD_ARGTYPES,
  CRUD_VISUAL_ARGS,
  LIST_ARGS,
  LIST_ARGTYPES,
  LIST_PARAMS,
  VISUAL_ARGS,
  mountedStore,
  resetSalesOrders,
  type SalesOrderCrudProps,
  type SalesOrderCrudStoryProps,
} from './sales-order-story-args';

/*
 * The record-editing showcase, neutral title (#520, epic #512): the Sales orders module of the shell that
 * `RecordCrud` is (#519). A List Report of 200 orders opens an order as a dedicated Object Page (header, Anchor Bar,
 * lines, sticky save-bar, dirty-guard) on top of an in-memory "server". The editor is mounted already hydrated:
 * while the order is in flight there is a loading state and no field at all.
 */

interface RecordPageArgs {
  recordId: string;
  loadDelayMs: number;
  saveDelayMs: number;
  saveOutcome: SaveOutcome;
  loadOutcome: LoadOutcome;
  onBack: () => void;
  onSaved: (order: StoredSalesOrder) => void;
}

function RecordPageDemo({ recordId, loadDelayMs, saveDelayMs, saveOutcome, loadOutcome, onBack, onSaved }: RecordPageArgs) {
  // One store per mount of the story: no module singleton, nothing shared between stories.
  const [store] = useState(() => createSalesOrderStore(undefined, { loadDelayMs, saveDelayMs, saveOutcome, loadOutcome }));
  // Layout effect: it runs before the page's passive fetch effect, so a changed control applies to that fetch.
  useLayoutEffect(() => {
    store.configure({ loadDelayMs, saveDelayMs, saveOutcome, loadOutcome });
  }, [store, loadDelayMs, saveDelayMs, saveOutcome, loadOutcome]);
  useEffect(() => {
    const w = window as unknown as { __ropShowcaseStore?: unknown };
    w.__ropShowcaseStore = store;
    return () => {
      if (w.__ropShowcaseStore === store) delete w.__ropShowcaseStore;
    };
  }, [store]);
  return <RecordPage module={SALES_ORDERS} store={store} recordId={recordId} onBack={onBack} onSaved={onSaved} />;
}

const SHOWCASE_FOLDER = 'packages/core/src/showcase';
// Every file of the showcase lives inside the core package, so it imports the components by relative path:
// in an app, those are imports from `@formrail/core`. What is NOT public API is said file by file.
const IN_APP = 'Imports the components by relative path because it lives inside the core package: in your app, import them from `@formrail/core`.';
// The listed files' text and repository path both derive from the file name (`showcaseFiles` throws on a name
// with no file next to this one), and e2e/docs-source.spec.ts compares what the page shows with the file on disk.
const SOURCES = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.{test,stories}.{ts,tsx}'], { query: '?raw', import: 'default', eager: true });
const SOURCE_FILES = showcaseFiles(SHOWCASE_FOLDER, SOURCES, {
  'RecordCrud.tsx': `The shell: the flow every module shares. List and record page as two routes, "New ..." and the creation page, deletion from the row (optimistic, with rollback), from the page (pessimistic) and in bulk, toasts, the dirty-guard, the focus after each navigation and each mutation. It holds no word of a domain: those come from the module. ${IN_APP} Not public: \`./record-api\`, \`./record-store\`, \`./record-module\`, \`./showcase-router\` (a minimal router for the story) and \`EMPTY_IDS\` from \`../list-report/use-list-report\` (an empty selection: write \`new Set<string>()\`).`,
  'RecordListView.tsx': `The shell's list: the List Report with URL state and scroll restoration (both per module), a link to the record page, the focus back on the opened row. ${IN_APP} Not public: \`./list-page\` (the frame of the page), \`./record-module\`, \`./record-store\`, \`./showcase-router\` and \`EMPTY_IDS\` from \`../list-report/use-list-report\`.`,
  'RecordPageShell.tsx': `The shell's record page: loading, not found, the editor mounted already hydrated, error summary, save bar, dirty-guard and its wording, Save/Discard, Create/Cancel, Delete. The fields come from the module. ${IN_APP} Not public: \`../internal/is-dev\`, \`./notice-cap\`, \`./record-module\`, \`./record-store\`.`,
  'record-module.ts': 'What a module gives the shell (`RecordModule`): its nouns, its store, its list (columns, pills, the link column, texts) and its form (values, validation, the sections as JSX). A plain object, written once per domain: no registry of fields, no form generated from a schema.',
  'showcase-modules.ts': 'The one list of the modules (record types) the router knows, the default one first. A new domain adds its name here, next to its module file.',
  'modules/sales-orders/sales-orders-module.tsx': `The Sales orders module: everything that belongs to sales orders only (their nouns, their list with the total in the order's currency and the status badge, the values and validation of their form, the fields of their record page as explicit JSX). The file a new domain copies. ${IN_APP} Not public: \`../../../calendar/date-math\` (an internal date helper), \`../../../internal/demo-data\` (the demo universe: fixtures, not part of the library), \`../../sales-order-store\`, \`../../record-module\`, \`./order-lines\`.`,
  'modules/sales-orders/SalesOrderLines.tsx': `The editable lines of an order, a section of the Sales orders module: add, remove, move, product Select, quantity, unit price, discount, the total of each line. ${IN_APP} Not public: \`../../../internal/use-list-mutation-focus\` (where the focus goes after adding or removing a row), \`../../../internal/demo-data\` and \`./order-lines\`.`,
  'modules/sales-orders/order-lines.ts': 'The rules on the lines of an order: money typed in the major unit of the order\'s currency (no decimals for JPY) and kept in minor units, the half-up discount, the totals, validation.',
  'sales-order-store.ts': 'Fixture, not part of the library: the in-memory "server" the showcase reads from and saves to, with configurable delays and failures. The sales orders\' instance of `./record-store`: the demo orders with their lines; every write derives the total from the lines.',
  'record-store.ts': 'Fixture, not part of the library: the in-memory "server" of any record type (list, read, save, create, delete), with configurable delays and failures. Each store is its own server: nothing is shared between two of them.',
  'record-api.ts': 'Fixture, not part of the library: the store as the pages call it. A write outlives the page that started it, so every read first waits for the writes still in flight: a list or a reopened order never shows a value older than the one the server is about to hold.',
});

const ORDER_OPTIONS = ['so-15', 'so-1', 'so-12', 'so-27', 'so-28', 'so-42', 'so-does-not-exist'];

const meta: Meta<RecordPageArgs> = {
  title: 'Showcase/Record editing',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "A complete worked example: a List Report of sales orders that opens an order as an Object Page (sections, lines, validation, a sticky save-bar and a dirty-guard), built only from the library's components. Use the controls to open another order (a cancelled one is read-only, a yen one has no decimals, one has 18 lines), slow down the load or open one that does not exist; edit a field and try to leave to see the guard. The `SalesOrderCrud` stories add the rest of the cycle: a creation page (customer required, at least one line), deleting an order from its row or from its page, and deleting several at once, each with a named confirmation. The source is on [GitHub](" +
          githubSource(SHOWCASE_FOLDER) +
          '); its main files are at the bottom of this page.',
      },
    },
  },
  // A showcase documents no component: every control is a knob of the demo.
  argTypes: storyControls({
    recordId: {
      control: 'select',
      options: ORDER_OPTIONS,
      description:
        'The order to open: `so-15` confirmed, `so-12` has a discontinued product, `so-27` has 18 lines, `so-28` is cancelled (read-only), `so-42` is in yen. `so-does-not-exist` shows the not-found state. Changing it mounts a fresh editor.',
    },
    loadDelayMs: {
      control: { type: 'range', min: 0, max: 3000, step: 100 },
      description: 'How long the order takes to arrive. Until then there is a loading state and no field.',
    },
    saveDelayMs: {
      control: { type: 'range', min: 0, max: 3000, step: 100 },
      description: 'How long a save takes. While it runs, "Save" is aria-disabled.',
    },
    saveOutcome: {
      control: 'radio',
      options: ['success', 'error'],
      description: '`error`: the save fails, the form stays dirty with the typed values and the store is unchanged.',
    },
    loadOutcome: {
      control: 'radio',
      options: ['success', 'error', 'error-once'],
      description: '`error`: the read fails (network). `error-once`: only the first read fails, so "Retry" succeeds.',
    },
    onBack: { control: false, description: '"Back to list": called at once if clean, after confirmation if dirty.' },
    onSaved: { control: false, description: 'Called once per successful save with the order as the server stored it.' },
  }),
  args: {
    recordId: 'so-15',
    loadDelayMs: 300,
    saveDelayMs: 400,
    saveOutcome: 'success',
    loadOutcome: 'success',
    onBack: fn(),
    onSaved: fn(),
  },
  // No `key` on the demo: the store lives as long as the story mount (an order saved earlier is still saved
  // after switching `recordId` and back); the shell's page mounts a fresh, hydrated editor for the new order.
  render: (args) => <RecordPageDemo {...args} />,
};

export default meta;
type Story = StoryObj<RecordPageArgs>;

const region = (canvas: ReturnType<typeof within>) => canvas.queryByRole('region', { name: 'Save actions' });
const orderTotal = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-order-total]')?.textContent ?? '';

/**
 * The whole flow with real input: load (no field until the order arrives), change the quantity of a line (the
 * total is recalculated and the save bar appears), put the old quantity back (the bar goes away: the form is
 * compared with the saved order), change it again, Save (the action is aria-disabled while it runs, then the bar
 * hides and the store holds the new total), and "Back to list" on a clean form leaves at once. Controls: order,
 * delays and save outcome. With `saveOutcome: error`, `loadOutcome: error` or an unknown `recordId` this play is
 * expected to fail (those states are what the Controls are for); a zero delay skips the in-flight assertions.
 */
export const SalesOrderRecordPage: Story = {
  tags: ['showcase-source'],
  parameters: showcaseSource(SHOWCASE_FOLDER, SOURCE_FILES),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    // The order is in flight: a loading state, no editable control (only observable with a delay).
    if (args.loadDelayMs > 0) {
      // Two nodes carry the text: the visible one and the hidden live region that announces it.
      await expect(canvas.getByRole('status')).toHaveTextContent('Loading sales order…');
      await expect(canvas.getAllByText('Loading sales order…')).toHaveLength(2);
      await expect(canvas.queryByRole('textbox')).toBeNull();
      await expect(canvas.queryByRole('combobox')).toBeNull();
    }

    // Arrived: the editor is mounted with the order's values and a hidden (clean) footer.
    const quantity = (await canvas.findByRole('textbox', { name: 'Line 1 quantity' })) as HTMLInputElement;
    await expect(region(canvas)).toBeNull();
    const original = quantity.value;
    const totalBefore = orderTotal(canvasElement);
    await expect(totalBefore).toMatch(/^[€$£¥][\d,.]+$/);

    // Change: the total follows, the save bar appears.
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '9');
    const bar = await canvas.findByRole('region', { name: 'Save actions' });
    await expect(orderTotal(canvasElement)).not.toBe(totalBefore);

    // The saved value again: the form is clean (compared with the saved order), the bar hides.
    await userEvent.clear(quantity);
    await userEvent.type(quantity, original);
    await waitFor(() => expect(region(canvas)).toBeNull());
    await expect(orderTotal(canvasElement)).toBe(totalBefore);
    await expect(bar).toBeInTheDocument();

    // Change again, then Save.
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '9');
    const save = within(await canvas.findByRole('region', { name: 'Save actions' })).getByRole('button', { name: 'Save' });
    await userEvent.click(save);
    // The in-flight state is only observable when the save takes a while.
    if (args.saveDelayMs >= 200) await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));

    // Saved: the bar hides, onSaved ran once, the store holds the quantity and the total derived from the lines.
    await waitFor(() => expect(region(canvas)).toBeNull());
    await expect(args.onSaved).toHaveBeenCalledTimes(1);
    await expect(args.onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: args.recordId }));
    const saved = mountedStore()?.snapshot().find((o) => o.id === args.recordId);
    await expect(saved?.lines[0]?.quantity).toBe(9);
    await expect(orderTotal(canvasElement)).toBe(formatMoney(saved?.totalMinor ?? 0, saved?.currency ?? 'EUR'));

    // Clean: "Back to list" leaves at once, with no confirmation dialog.
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    await expect(args.onBack).toHaveBeenCalledTimes(1);
    await expect(body.queryByRole('dialog')).toBeNull();
  },
};

/** `SalesOrderRecordPage` without a `play` function: what `e2e/showcase-sales-orders.spec.ts` drives with real input. */
export const SalesOrderRecordPageManual: Story = {};

/**
 * The lines of an order: add a line (the focus goes to its product, which takes its unit price from the
 * catalogue), fill it, see the line total and the order total follow; remove the line you added (the focus goes to
 * the line that took its place, the total is the saved one again and, the lines being the saved ones, the save bar
 * goes away); remove the first line (the focus goes to the Remove button of the line that took its place) and
 * move the other one up. Controls: order, delays.
 */
export const SalesOrderLines: Story = {
  args: { loadDelayMs: 0, saveDelayMs: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await canvas.findByRole('textbox', { name: 'Line 1 quantity' });
    const lineCount = canvas.getAllByRole('button', { name: /^Remove line / }).length;
    const totalBefore = orderTotal(canvasElement);
    await expect(region(canvas)).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Add line' }));
    const next = lineCount + 1;
    const product = canvas.getByRole('combobox', { name: `Line ${next} product` });
    await expect(product).toHaveFocus();
    await expect(await canvas.findByRole('region', { name: 'Save actions' })).toBeVisible();
    // Not finished (no product, no price): no total for the line nor for the order.
    await expect(orderTotal(canvasElement)).toBe('—');

    await userEvent.click(product);
    await userEvent.click((await body.findAllByRole('option'))[0] as HTMLElement);
    const price = canvas.getByRole('textbox', { name: new RegExp(`^Line ${next} unit price`) }) as HTMLInputElement;
    await expect(price.value).toMatch(/^\d+(\.\d{2})?$/);
    const quantity = canvas.getByRole('textbox', { name: `Line ${next} quantity` });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '3');
    const discount = canvas.getByRole('textbox', { name: `Line ${next} discount (%)` });
    await userEvent.clear(discount);
    await userEvent.type(discount, '10');
    const lineTotal = canvasElement.querySelectorAll('[data-line-total]')[next - 1]?.textContent ?? '';
    await expect(lineTotal).toMatch(/^[€$£¥][\d,.]+$/);
    await expect(orderTotal(canvasElement)).not.toBe(totalBefore);

    // Remove the line just added: the focus goes to the previous line's Remove button, the lines are the saved
    // ones again, so the total is the saved one and the bar is gone.
    await userEvent.click(canvas.getByRole('button', { name: `Remove line ${next}` }));
    await expect(canvas.getByRole('button', { name: `Remove line ${lineCount}` })).toHaveFocus();
    await expect(orderTotal(canvasElement)).toBe(totalBefore);
    await waitFor(() => expect(region(canvas)).toBeNull());

    // Remove the first line: the line that takes its place gets the focus on its Remove button.
    await userEvent.click(canvas.getByRole('button', { name: 'Remove line 1' }));
    await expect(canvas.getByRole('button', { name: 'Remove line 1' })).toHaveFocus();
    await expect(canvas.getAllByRole('button', { name: /^Remove line / })).toHaveLength(lineCount - 1);
    await expect(orderTotal(canvasElement)).not.toBe(totalBefore);
    await expect(await canvas.findByRole('region', { name: 'Save actions' })).toBeVisible();
  },
};

/** The order with its lines, no delays: the "Lines" section as photographed at 3 viewports. */
export const SalesOrderRecordLines: Story = {
  tags: ['visual'],
  args: { recordId: 'so-15', loadDelayMs: 0, saveDelayMs: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('textbox', { name: 'Line 2 quantity' })).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: /^Remove line / })).toHaveLength(2);
    await expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull();
    // Scrolls the section into view through the Anchor Bar, then waits for the scroll to settle.
    await userEvent.click(canvas.getByRole('link', { name: 'Lines' }));
    const heading = canvas.getByRole('heading', { name: 'Lines' });
    let last = Number.NaN;
    await waitFor(() => {
      const top = heading.getBoundingClientRect().top;
      const settled = top === last;
      last = top;
      expect(settled).toBe(true);
    });
  },
};

/* ------------------------------------------------------------------------------------------ */
/* The list opens the order as a dedicated page and comes back.                                  */
/* ------------------------------------------------------------------------------------------ */

type ListToRecordArgs = SalesOrderCrudProps;

const listRender = (args: ListToRecordArgs) => <RecordCrud {...args} module={SALES_ORDERS} />;

/** Lets a programmatic scroll report itself (next frame) and be saved before the script leaves the list. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

async function startList(canvasElement: HTMLElement, minRows = 10) {
  const canvas = within(canvasElement);
  const win = canvasElement.ownerDocument.defaultView;
  if (!win) throw new Error('sales orders story: no window');
  resetSalesOrders(win);
  await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(minRows), { timeout: 5000 });
  return { canvas, win };
}

/**
 * List Report to Object Page as a dedicated page. The "Number" cell is a real link (`href` = the list's
 * parameters + `record=<id>`); a plain click `pushState`s the route and shows the order INSTEAD of the list (the
 * list is unmounted). "Back to list" and the browser's Back bring it back with the pill, the sort and the scroll
 * restored, and the focus on the opened row's link (the title if the row is out of view). The play function
 * drives the whole round: pill "Confirmed", sort by Total (the first click is descending), scroll, open an
 * order, come back. Controls: the two load delays and `history`.
 */
export const SalesOrderListToRecord: StoryObj<ListToRecordArgs> = {
  argTypes: LIST_ARGTYPES,
  args: LIST_ARGS,
  render: listRender,
  play: async ({ canvasElement, args }) => {
    const { canvas, win } = await startList(canvasElement);
    await expect(args.onNavigate).not.toHaveBeenCalled();
    await expect(canvas.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeVisible();

    await userEvent.click(canvas.getByRole('radio', { name: 'Confirmed' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Total' }));
    await expect(canvas.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
    const scrollerOf = () => canvas.getByRole('table').parentElement as HTMLElement;
    scrollerOf().scrollTop = 300;
    await waitFor(() => expect(scrollerOf().scrollTop).toBe(300));
    const before = scrollerOf().scrollTop;
    // A programmatic scroll reports itself with a `scroll` event on the next frame; a person cannot click
    // faster than that, the script can. Give the position time to be seen (and saved) before leaving.
    await settle();

    // A link in view, not at the very top.
    const area = scrollerOf().getBoundingClientRect();
    const link = canvas
      .getAllByRole('link')
      .find((l) => l.getBoundingClientRect().top > area.top + 120 && l.getBoundingClientRect().bottom < area.bottom);
    if (!link) throw new Error('SalesOrderListToRecord: no link in view');
    const number = link.textContent ?? '';
    const id = link.getAttribute('data-record-id');
    await expect(link.getAttribute('href')).toContain(`record=${id}`);
    await expect(link.getAttribute('href')).toContain('module=sales-orders');
    await expect(link.getAttribute('href')).toContain(`${LIST_PARAMS.filter}=confirmed`);

    await userEvent.click(link);
    await expect(args.onNavigate).toHaveBeenLastCalledWith({ to: 'record', id });
    await expect(new URLSearchParams(win.location.search).get('record')).toBe(id);
    await expect(await canvas.findByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    await expect(canvas.queryByRole('table')).toBeNull();

    await userEvent.click(await canvas.findByRole('button', { name: 'Back to list' }));
    await expect(args.onNavigate).toHaveBeenLastCalledWith({ to: 'list' });
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });

    const params = new URLSearchParams(win.location.search);
    await expect(params.get('record')).toBeNull();
    await expect(params.get(LIST_PARAMS.filter)).toBe('confirmed');
    await expect(params.get(LIST_PARAMS.sort)).toBe('total.desc');
    await expect(canvas.getByRole('radio', { name: 'Confirmed' })).toBeChecked();
    await expect(canvas.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
    await waitFor(() => expect(Math.abs(scrollerOf().scrollTop - before)).toBeLessThanOrEqual(1));
    await waitFor(() => expect(canvas.getByRole('link', { name: number })).toHaveFocus());
  },
};

/** `SalesOrderListToRecord` without a `play` function: what `e2e/showcase-sales-orders.spec.ts` drives with real input. */
export const SalesOrderListToRecordManual: StoryObj<ListToRecordArgs> = {
  argTypes: LIST_ARGTYPES,
  args: LIST_ARGS,
  render: listRender,
};

/**
 * The round a buyer wants to see: filter, sort, open an order, change the quantity of a line, "Back to list" asks
 * for confirmation, "Keep editing" keeps the value and the focus on "Back to list", Save, then "Back to list" leaves
 * with no question and the row shows the total the server derived from the lines. Then another order: change,
 * Back, "Discard changes" and the list and the store are unchanged.
 *
 * Declared behaviour: leaving while a save is in flight ("Back to list", then "Leave anyway") is immediate; the
 * save is not cancelled, so once it resolves the store holds the saved order. The demo's reads (the list, a
 * re-opened order) wait for the saves in flight, so they show that order. Controls: both load delays,
 * `saveDelayMs`, `saveOutcome` (`error` keeps the form dirty with the message in the footer), `history`.
 */
export const SalesOrderEditFlow: StoryObj<ListToRecordArgs> = {
  argTypes: LIST_ARGTYPES,
  args: LIST_ARGS,
  render: listRender,
  play: async ({ canvasElement, args }) => {
    const { canvas, win } = await startList(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole('radio', { name: 'Confirmed' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Total' }));
    const scrollerOf = () => canvas.getByRole('table').parentElement as HTMLElement;
    scrollerOf().scrollTop = 300;
    await waitFor(() => expect(scrollerOf().scrollTop).toBe(300));
    await settle();

    const pickLink = (skip?: string) => {
      const area = scrollerOf().getBoundingClientRect();
      const found = canvas
        .getAllByRole('link')
        .find(
          (l) =>
            l.textContent !== skip &&
            l.getBoundingClientRect().top > area.top + 120 &&
            l.getBoundingClientRect().bottom < area.bottom,
        );
      if (!found) throw new Error('SalesOrderEditFlow: no link in view');
      return found;
    };
    const rowOf = (number: string) => canvas.getByRole('link', { name: number }).closest('tr') as HTMLElement;
    const totalCell = (number: string) => within(rowOf(number)).getAllByRole('cell')[4] as HTMLElement;
    const back = () => canvas.findByRole('button', { name: 'Back to list' });
    const quantityField = () => canvas.findByRole('textbox', { name: 'Line 1 quantity' });
    const listBack = () => waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });

    // 1. Open an order, change a quantity, "Back to list" asks, "Keep editing" keeps everything.
    const link = pickLink();
    const number = link.textContent ?? '';
    const id = link.getAttribute('data-record-id') ?? '';
    const totalBefore = totalCell(number).textContent;
    await userEvent.click(link);
    const quantity = (await quantityField()) as HTMLInputElement;
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '37');
    await userEvent.click(await back());
    const dialog = await body.findByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(quantity).toHaveValue('37');
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Back to list' })).toHaveFocus());
    await expect(new URLSearchParams(win.location.search).get('record')).toBe(id);

    // 2. Save, then leave with no question: the row shows the total the server derived from the lines.
    const bar = await canvas.findByRole('region', { name: 'Save actions' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull());
    await expect(args.onSaved).toHaveBeenCalledTimes(1);
    const saved = mountedStore()?.snapshot().find((o) => o.id === id);
    await expect(saved?.lines[0]?.quantity).toBe(37);
    const expected = formatMoney(saved?.totalMinor ?? 0, saved?.currency ?? 'EUR');
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    await expect(body.queryByRole('dialog')).toBeNull();
    await listBack();
    await expect(expected).not.toBe(totalBefore);
    // The saved order may have moved with the sort (and be out of view), so find its row by the number.
    await waitFor(() => expect(canvas.getByRole('link', { name: number })).toBeInTheDocument());
    await expect(totalCell(number)).toHaveTextContent(expected);
    let params = new URLSearchParams(win.location.search);
    await expect(params.get('record')).toBeNull();
    await expect([params.get(LIST_PARAMS.filter), params.get(LIST_PARAMS.sort)]).toEqual(['confirmed', 'total.desc']);
    await expect(canvas.getByRole('radio', { name: 'Confirmed' })).toBeChecked();

    // 3. Another order: change, Back, "Discard changes": the list and the store are unchanged.
    const other = pickLink(number);
    const otherNumber = other.textContent ?? '';
    const otherTotal = totalCell(otherNumber).textContent ?? '';
    const stored = JSON.stringify(mountedStore()?.snapshot());
    await userEvent.click(other);
    const field = (await quantityField()) as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, '77');
    await userEvent.click(await back());
    const confirm = await body.findByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Discard changes' }));
    await listBack();
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(totalCell(otherNumber)).toHaveTextContent(otherTotal);
    await expect(JSON.stringify(mountedStore()?.snapshot())).toBe(stored);
    params = new URLSearchParams(win.location.search);
    await expect(params.get('record')).toBeNull();
  },
};

/** `SalesOrderEditFlow` without a `play` function: what `e2e/showcase-sales-orders.spec.ts` drives with real input. */
export const SalesOrderEditFlowManual: StoryObj<ListToRecordArgs> = {
  argTypes: LIST_ARGTYPES,
  args: LIST_ARGS,
  render: listRender,
};

/* ------------------------------------------------------------------------------------------ */
/* Visual-regression states (3 viewports, via the `visual` tag).                                  */
/* ------------------------------------------------------------------------------------------ */

// Deterministic picture: no delays (nothing is mid-load when the screenshot is taken) and the same first order
// every time. The `play` brings the story to the state; the visual spec runs it first.
const VISUAL_NOTE = 'Deliver to the goods-in door, before noon.';

async function visualOpenOrder(canvas: ReturnType<typeof within>) {
  await userEvent.click(canvas.getAllByRole('link')[0] as HTMLElement);
  await expect(await canvas.findByRole('heading', { level: 1 })).toBeVisible();
  return (await canvas.findByRole('textbox', { name: 'Notes' })) as HTMLInputElement;
}

async function visualMakeDirty(canvas: ReturnType<typeof within>, notes: HTMLInputElement) {
  await userEvent.clear(notes);
  await userEvent.type(notes, VISUAL_NOTE);
  await expect(await canvas.findByRole('region', { name: 'Save actions' })).toBeVisible();
}

/** An order just opened from the list: header, Anchor Bar, hydrated sections, hidden (clean) save bar. */
export const SalesOrderRecordOpen: StoryObj<ListToRecordArgs> = {
  tags: ['visual'],
  argTypes: LIST_ARGTYPES,
  args: VISUAL_ARGS,
  render: listRender,
  play: async ({ canvasElement }) => {
    const { canvas } = await startList(canvasElement, 5);
    await visualOpenOrder(canvas);
    await expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull();
  },
};

/** The same order after typing in "Notes": the sticky save bar is visible and the space it needs was already reserved. */
export const SalesOrderRecordDirty: StoryObj<ListToRecordArgs> = {
  tags: ['visual'],
  argTypes: LIST_ARGTYPES,
  args: VISUAL_ARGS,
  render: listRender,
  play: async ({ canvasElement }) => {
    const { canvas } = await startList(canvasElement, 5);
    const notes = await visualOpenOrder(canvas);
    await visualMakeDirty(canvas, notes);
    await expect(notes).toHaveValue(VISUAL_NOTE);
  },
};

/** Dirty order, then "Back to list": the confirmation Dialog is open over the page. */
export const SalesOrderLeaveGuardOpen: StoryObj<ListToRecordArgs> = {
  tags: ['visual'],
  argTypes: LIST_ARGTYPES,
  args: VISUAL_ARGS,
  render: listRender,
  play: async ({ canvasElement }) => {
    const { canvas } = await startList(canvasElement, 5);
    const notes = await visualOpenOrder(canvas);
    await visualMakeDirty(canvas, notes);
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    const dialog = await within(document.body).findByRole('dialog', { name: 'Unsaved changes' });
    // The Dialog fades in: "visible" (opacity) is only true once the entry animation has progressed.
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  },
};

/** Edit, Save, "Back to list": the list again, the row link focused, the new total in the row. */
export const SalesOrderListAfterSave: StoryObj<ListToRecordArgs> = {
  tags: ['visual'],
  argTypes: LIST_ARGTYPES,
  args: VISUAL_ARGS,
  render: listRender,
  play: async ({ canvasElement, args }) => {
    const { canvas } = await startList(canvasElement, 5);
    const number = canvas.getAllByRole('link')[0]?.textContent ?? '';
    await visualOpenOrder(canvas);
    const quantity = (await canvas.findByRole('textbox', { name: 'Line 1 quantity' })) as HTMLInputElement;
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '25');
    const bar = await canvas.findByRole('region', { name: 'Save actions' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull());
    await expect(args.onSaved).toHaveBeenCalledTimes(1);
    const saved = mountedStore()?.snapshot().find((o) => o.number === number);
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(5), { timeout: 5000 });
    const row = canvas.getByRole('link', { name: number }).closest('tr') as HTMLElement;
    await expect(row).toHaveTextContent(formatMoney(saved?.totalMinor ?? 0, saved?.currency ?? 'EUR'));
    await waitFor(() => expect(canvas.getByRole('link', { name: number })).toHaveFocus());
  },
};

/* ------------------------------------------------------------------------------------------ */
/* #521: creation and deletion (the `SALES_ORDERS_CRUD` module), end to end and as pictures.     */
/* ------------------------------------------------------------------------------------------ */

type CrudArgs = SalesOrderCrudStoryProps;
const crudRender = (args: CrudArgs) => <RecordCrud {...args} module={SALES_ORDERS_CRUD} />;

// The first orders of the demo list, in the order of the list without sort (the numbers are fixed by the seed).
const SECOND = 'SO-2026-018000002';
const THIRD = 'SO-2026-056000003';
const BULK = [SECOND, 'SO-2026-038000004', 'SO-2026-144000005'];
const FIRST_CUSTOMER = 'Hoevenstrand Coatings BV (EUR)';

/** Picks the customer in the Select of the creation page (its options are in a portal on `document.body`). */
async function chooseCustomer(canvas: ReturnType<typeof within>, name = FIRST_CUSTOMER) {
  await userEvent.click(await canvas.findByRole('combobox', { name: /Customer/ }));
  await userEvent.click(await within(document.body).findByRole('option', { name }));
}

/** Adds one line with the first product of the Select, the quantity and the unit price typed. */
async function addLine(canvas: ReturnType<typeof within>, quantity: string, unitPrice: string) {
  await userEvent.click(canvas.getByRole('button', { name: 'Add line' }));
  await userEvent.click(await canvas.findByRole('combobox', { name: /Line 1 product/ }));
  await userEvent.click((await within(document.body).findAllByRole('option'))[0] as HTMLElement);
  const qty = canvas.getByRole('textbox', { name: /Line 1 quantity/ });
  await userEvent.clear(qty);
  await userEvent.type(qty, quantity);
  const price = canvas.getByRole('textbox', { name: /Line 1 unit price/ });
  await userEvent.clear(price);
  await userEvent.type(price, unitPrice);
}

/**
 * Create, end to end: sort the list by Total (the first click is descending), "New sales order" opens the editor in
 * creation mode (focus on the title), choose a customer (the currency comes with it), add a line, "Create": back to
 * the list (same sort, 201 orders), the new order at the top and focused, and a toast with its number. The footer
 * is never reported as "unsaved" after a successful Create. Controls: delays, `saveOutcome` (`error` keeps the
 * form with the message in the footer), `history`, `today`.
 */
export const SalesOrderCrud: StoryObj<CrudArgs> = {
  argTypes: CRUD_ARGTYPES,
  args: CRUD_ARGS,
  render: crudRender,
  play: async ({ canvasElement, args }) => {
    const { canvas, win } = await startList(canvasElement);
    await expect(canvas.getByRole('heading', { level: 2, name: /\(200\)/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Total' }));

    await userEvent.click(canvas.getByRole('button', { name: 'New sales order' }));
    await expect(args.onNavigate).toHaveBeenLastCalledWith({ to: 'create' });
    await expect(new URLSearchParams(win.location.search).get('create')).toBe('1');
    const title = await canvas.findByRole('heading', { level: 1, name: 'New sales order' });
    await waitFor(() => expect(title).toHaveFocus());
    await expect(canvas.queryByRole('table')).toBeNull();

    await chooseCustomer(canvas);
    await addLine(canvas, '1000', '100000.00');
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }));

    if (args.saveOutcome === 'error') {
      // The server refuses: the page stays with what was typed, the message is in the footer, nothing was created.
      const footer = await canvas.findByRole('region', { name: 'Save actions' });
      await waitFor(() => expect(footer).toHaveTextContent(/Could not save/i), { timeout: 5000 });
      await expect(canvas.getByRole('heading', { level: 1, name: 'New sales order' })).toBeVisible();
      await expect(canvas.getByRole('textbox', { name: /Line 1 quantity/ })).toHaveValue('1000');
      await expect(mountedStore()?.snapshot()).toHaveLength(200);
      await expect(args.onCreated).not.toHaveBeenCalled();
      return;
    }

    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });
    await expect(args.onCreated).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(win.location.search);
    await expect(params.get('create')).toBeNull();
    await expect(params.get(LIST_PARAMS.sort)).toBe('total.desc');
    await expect(canvas.getByRole('heading', { level: 2, name: /\(201\)/ })).toBeVisible();
    await expect(canvas.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
    await waitFor(() => expect(canvas.getByRole('link', { name: 'SO-NEW-0201' })).toHaveFocus());
    await expect(await within(document.body).findByText('Sales order SO-NEW-0201 created')).toBeVisible();
    await expect(within(document.body).queryByRole('dialog')).toBeNull();
  },
};

/**
 * Delete from the list, optimistic: "..." of the second order -> "Delete" -> the confirmation (focus on Cancel) ->
 * "Delete sales order". The row goes AT ONCE, before the server answers (the store still holds it), the count goes
 * from 200 to 199, the focus lands on the "..." of the row that took its place, and once the server answered a
 * toast confirms it. Controls: `saveDelayMs` (how long the server takes), `deleteOutcome` (`error`: the row comes
 * back where it was, with an error toast). On an order page "Delete" waits for the server.
 */
export const SalesOrderCrudDelete: StoryObj<CrudArgs> = {
  argTypes: CRUD_ARGTYPES,
  args: { ...CRUD_ARGS, saveDelayMs: 800 },
  render: crudRender,
  play: async ({ canvasElement, args }) => {
    const { canvas } = await startList(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole('heading', { level: 2, name: /\(200\)/ })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: `Actions for ${SECOND}` }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await body.findByRole('dialog', { name: `Delete sales order ${SECOND}?` });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));

    // Optimistic: gone from the list while the server still holds it. (`hidden`: until the dialog has finished
    // closing, the page behind it is still `aria-hidden`.)
    await waitFor(() => expect(canvas.queryByRole('link', { name: SECOND, hidden: true })).toBeNull());
    if (args.deleteOutcome !== 'error' && Number(args.saveDelayMs) > 0) {
      await expect(mountedStore()?.snapshot().some((o) => o.number === SECOND)).toBe(true);
    }
    await expect(canvas.getByRole('heading', { level: 2, name: /\(199\)/, hidden: true })).toBeInTheDocument();
    // After the dialog's exit animation.
    await waitFor(() => expect(canvas.getByRole('button', { name: `Actions for ${THIRD}` })).toHaveFocus(), { timeout: 3000 });
    await expect(body.queryByRole('dialog')).toBeNull();
    if (args.deleteOutcome === 'error') {
      const error = await body.findByText(`Could not delete ${SECOND}`, undefined, { timeout: 5000 });
      await waitFor(() => expect(error).toBeVisible());
      await expect(await canvas.findByRole('link', { name: SECOND })).toBeVisible();
      return;
    }
    const done = await body.findByText(`Sales order ${SECOND} deleted`, undefined, { timeout: 5000 });
    await waitFor(() => expect(done).toBeVisible());
    await expect(mountedStore()?.snapshot().some((o) => o.number === SECOND)).toBe(false);
    await expect(args.onDeleted).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole('button', { name: `Actions for ${THIRD}` })).toHaveFocus();
  },
};

/**
 * Bulk delete from the list, optimistic and atomic: tick three orders (the bar says "3 selected"), "Delete
 * selected" -> "Delete 3 sales orders?" (focus on Cancel) -> "Delete 3 sales orders". The three rows go AT ONCE,
 * before the server answers (the store still holds them), the count goes from 200 to 197, the focus lands on
 * "Select all results", and once the server answered a toast confirms it. Controls: `saveDelayMs`, `deleteOutcome`
 * (`error`: all three rows come back where they were, still selected, with an error toast).
 */
export const SalesOrderCrudBulkDelete: StoryObj<CrudArgs> = {
  argTypes: CRUD_ARGTYPES,
  // 2.5 s: the assertions made "while the server has not answered" need a window that a loaded machine does not
  // close under them.
  args: { ...CRUD_ARGS, saveDelayMs: 2500 },
  render: crudRender,
  play: async ({ canvasElement, args }) => {
    const { canvas } = await startList(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole('heading', { level: 2, name: /\(200\)/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Delete selected' })).toHaveAttribute('aria-disabled', 'true');

    for (const n of BULK) await userEvent.click(canvas.getByRole('checkbox', { name: `Select ${n}` }));
    await expect(canvas.getByText('3 selected')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Delete selected' }));
    const dialog = await body.findByRole('dialog', { name: 'Delete 3 sales orders?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 3 sales orders' }));

    for (const n of BULK) await waitFor(() => expect(canvas.queryByRole('link', { name: n, hidden: true })).toBeNull());
    if (args.deleteOutcome !== 'error' && Number(args.saveDelayMs) > 0) {
      await expect(mountedStore()?.snapshot().some((o) => o.number === BULK[0])).toBe(true);
    }
    await expect(canvas.getByRole('heading', { level: 2, name: /\(197\)/, hidden: true })).toBeInTheDocument();
    await waitFor(() => expect(canvas.getByRole('checkbox', { name: 'Select all results' })).toHaveFocus(), { timeout: 3000 });
    await expect(body.queryByRole('dialog')).toBeNull();
    if (args.deleteOutcome === 'error') {
      const error = await body.findByText('Could not delete 3 sales orders', undefined, { timeout: 5000 });
      await waitFor(() => expect(error).toBeVisible());
      for (const n of BULK) await expect(await canvas.findByRole('link', { name: n })).toBeVisible();
      await expect(canvas.getByText('3 selected')).toBeVisible();
      return;
    }
    const done = await body.findByText('3 sales orders deleted', undefined, { timeout: 5000 });
    await waitFor(() => expect(done).toBeVisible());
    await expect(mountedStore()?.snapshot()).toHaveLength(197);
    await expect(args.onDeleted).toHaveBeenCalledTimes(3);
    await expect(canvas.getByText('No items selected')).toBeVisible();
    await expect(canvas.getByRole('checkbox', { name: 'Select all results' })).toHaveFocus();
  },
};

/** `SalesOrderCrud` without a `play` function: what `e2e/showcase-sales-orders-crud.spec.ts` drives with real input. */
export const SalesOrderCrudManual: StoryObj<CrudArgs> = {
  argTypes: CRUD_ARGTYPES,
  args: CRUD_ARGS,
  render: crudRender,
};

// Visual states (3 viewports, via the `visual` tag): `today` is fixed so the dates do not change with the calendar,
// no delays.
async function openCreation(canvasElement: HTMLElement) {
  const { canvas } = await startList(canvasElement, 5);
  await userEvent.click(canvas.getByRole('button', { name: 'New sales order' }));
  await expect(await canvas.findByRole('heading', { level: 1, name: 'New sales order' })).toBeVisible();
  return canvas;
}

/** A new order, untouched: defaults, the locked number, no customer, no line, no status badge, the footer already there. */
export const SalesOrderCreateEmpty: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: crudRender,
  play: async ({ canvasElement }) => {
    const canvas = await openCreation(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Save actions' })).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: /Customer/ })).toHaveTextContent('Choose a customer');
  },
};

/** "Create" on the empty form: the field errors (customer, lines) and the summary in the footer. */
export const SalesOrderCreateInvalid: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: crudRender,
  play: async ({ canvasElement }) => {
    const canvas = await openCreation(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }));
    await expect(await canvas.findByText('2 invalid fields')).toBeVisible();
  },
};

/** A Create in flight (the delay is an hour, the picture is taken before it ends): "Create" disabled, "Saving...". */
export const SalesOrderCreateSaving: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: { ...CRUD_VISUAL_ARGS, saveDelayMs: 3_600_000 },
  render: crudRender,
  play: async ({ canvasElement }) => {
    const canvas = await openCreation(canvasElement);
    await chooseCustomer(canvas);
    await addLine(canvas, '12', '120.50');
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }));
    await expect(await canvas.findByText('Saving…')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** The delete confirmation over the list ("..." of the second row -> "Delete"), not confirmed. */
export const SalesOrderDeleteConfirmList: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: crudRender,
  play: async ({ canvasElement }) => {
    const { canvas } = await startList(canvasElement, 5);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: `Actions for ${SECOND}` }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await body.findByRole('dialog', { name: `Delete sales order ${SECOND}?` });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
  },
};

/** The selection bar with "Delete selected" disabled (nothing selected). */
export const SalesOrderBulkDeleteIdle: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: crudRender,
  play: async ({ canvasElement }) => {
    const { canvas } = await startList(canvasElement, 5);
    await expect(canvas.getByRole('button', { name: 'Delete selected' })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** Three orders selected, "Delete selected" enabled. */
export const SalesOrderBulkDeleteSelected: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: crudRender,
  play: async ({ canvasElement }) => {
    const { canvas } = await startList(canvasElement, 5);
    for (const n of BULK) await userEvent.click(canvas.getByRole('checkbox', { name: `Select ${n}` }));
    await expect(canvas.getByText('3 selected')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Delete selected' })).not.toHaveAttribute('aria-disabled');
  },
};

/** The bulk delete confirmation over the list (three orders selected), not confirmed. */
export const SalesOrderBulkDeleteConfirm: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: CRUD_VISUAL_ARGS,
  render: crudRender,
  play: async ({ canvasElement }) => {
    const { canvas } = await startList(canvasElement, 5);
    const body = within(canvasElement.ownerDocument.body);
    for (const n of BULK) await userEvent.click(canvas.getByRole('checkbox', { name: `Select ${n}` }));
    await userEvent.click(canvas.getByRole('button', { name: 'Delete selected' }));
    const dialog = await body.findByRole('dialog', { name: 'Delete 3 sales orders?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
  },
};

/**
 * The delete confirmation over an order page with unsaved changes, CONFIRMED and waiting for the server (the delay
 * is an hour, the picture is taken before it ends): the warning about the unsaved changes, the spinner on "Delete
 * sales order", both buttons `aria-disabled`.
 */
export const SalesOrderDeleteConfirmRecordPending: StoryObj<CrudArgs> = {
  tags: ['visual'],
  argTypes: CRUD_ARGTYPES,
  args: { ...CRUD_VISUAL_ARGS, saveDelayMs: 3_600_000 },
  render: crudRender,
  play: async ({ canvasElement }) => {
    const { canvas } = await startList(canvasElement, 5);
    const body = within(canvasElement.ownerDocument.body);
    const first = canvas.getAllByRole('link')[0] as HTMLElement;
    const number = first.textContent ?? '';
    await userEvent.click(first);
    await canvas.findByRole('heading', { level: 1, name: new RegExp(number) });
    await userEvent.type(await canvas.findByRole('textbox', { name: 'Notes' }), ' (draft)');
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }));
    const dialog = await body.findByRole('dialog', { name: `Delete sales order ${number}?` });
    // `waitFor`: the dialog enters with an animation (transparent at first).
    await waitFor(() => expect(within(dialog).getByText(/Unsaved changes will be lost too\./)).toBeVisible());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));
    await expect(within(dialog).getByRole('button', { name: 'Delete sales order' })).toHaveAttribute('aria-disabled', 'true');
  },
};
