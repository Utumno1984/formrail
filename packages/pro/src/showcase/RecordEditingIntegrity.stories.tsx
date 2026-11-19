/// <reference types="vite/client" />
import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
// The Free record-editing shell and its Sales orders module, from the core sources (one copy, never duplicated in
// packages/pro): see the `no-restricted-imports` rules of eslint.config.js, which allow this in `src/showcase/` only.
import { getProduct } from '../../../core/src/internal/demo-data';
import { storyControls } from '../../../core/src/internal/story-docs';
import { githubSource, showcaseFiles, showcaseSource } from '../../../core/src/internal/story-example';
import { SALES_ORDERS_CRUD } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';
import { RecordCrud } from '../../../core/src/showcase/RecordCrud';
import {
  CRUD_ARGS,
  CRUD_ARGTYPES,
  CRUD_VISUAL_ARGS,
  mountedStore,
  resetSalesOrders,
  type SalesOrderCrudStoryProps,
} from '../../../core/src/showcase/sales-order-story-args';
import {
  CUSTOMER_LIST_ARGS,
  CUSTOMER_LIST_ARGTYPES,
  CUSTOMER_VISUAL_ARGS,
  mountedCustomerStore,
  resetCustomers,
  type CustomerCrudProps,
} from '../../../core/src/showcase/customer-story-args';
import { accountManagerOptions } from '../../../core/src/showcase/modules/customers/customers-module';
import { ORDER_ONLY_DESCRIPTION, salesOrderSaveReview } from './sales-order-review';
import { NOTICE_TITLE, SALES_ORDER_SERVER_CHANGES, salesOrderRebaseAddons, type SalesOrderRebaseOptions } from './sales-order-rebase';
import { customerSaveReview } from './customer-review';
import {
  ARCHIVED_REVIEW_DESCRIPTION,
  ARCHIVED_SAVE_ERROR,
  ARCHIVED_TITLE,
  CUSTOMERS_WITH_INTEGRITY,
  CUSTOMER_SERVER_CHANGES,
  NOTICE_TITLE as CUSTOMER_NOTICE_TITLE,
  UNSAVED_LIST_LABEL,
  customerRebaseAddons,
  nextAccountManager,
  serverEmail,
  type CustomerRebaseOptions,
} from './customer-rebase';

const SHOWCASE_FOLDER = 'packages/pro/src/showcase';
// The listed files' text and repository path both derive from their name (see the Free showcase's stories).
const SOURCES = import.meta.glob<string>(['./*.{ts,tsx}', '!./*.{test,stories,test-kit}.{ts,tsx}'], { query: '?raw', import: 'default', eager: true });
const IN_APP =
  'In your app, import them from `@formrail/pro` (this file reaches them through relative imports because it lives inside the Pro package). Not public: the relative imports of the Free showcase (`../../../core/src/...`: the shell, the Sales orders module and the demo data).';
const SOURCE_FILES = showcaseFiles(SHOWCASE_FOLDER, SOURCES, {
  'sales-order-review.tsx': `The review step, plugged into the Free shell through the per-module \`reviewSave\` add-on: \`computeChangeSummaryResult\` against the order saved on the server, lines matched by \`id\`, rows named by \`itemLabel\`, a mere reorder from \`reorders\`, values in the order's currency. Uses \`ChangeSummary\`, \`computeChangeSummaryResult\`, \`formatChangeValue\` and the \`ChangeEntry\`, \`ChangeSummaryResult\`, \`ItemLabelContext\` types. ${IN_APP}`,
  'sales-order-rebase.tsx': `The server update, plugged in through the per-module \`useAddons\` add-on: \`useFormRebase\` merges each version the server announces into the open order, \`RebaseNotice\` shows what arrived and the conflicts, with the same \`itemLabel\` and values as the review. ${IN_APP}`,
  'customer-review.tsx': `The review step of the customers, a record of another shape: the nested billing address (\`Billing address > Postal code\`), the contacts matched by \`id\` and named by \`itemLabel\` (\`Contact 2 (Giulia Bellini)\`), a mere reorder from \`reorders\`, the account manager and the primary contact by name, the credit limit in its currency. ${IN_APP}`,
  'customer-rebase.tsx': `The server update of the customers: the same \`useFormRebase\` and \`RebaseNotice\`, a contact the server removed while it is edited is a conflict explained on its fields, and a customer archived on the server while it is open keeps the user's changes visible and listed as text (the showcase's server refuses to change an archived customer). ${IN_APP}`,
  'record-integrity.tsx': `What the add-ons of every module share: how "no value" reads (\`Empty\`, \`Null\`, \`Missing\`), a top-level field with no value on one side, the counts of the review, and the state the open review reads while a server update lands under it. ${IN_APP}`,
});

/*
 * The Pro "record editing integrity" add-ons on the SAME record-editing shell as `Showcase/Record editing` (List
 * Report -> Object Page), per module (the customers' stories are below the sales orders' ones). Sales orders module: "Review changes" before saving an existing order (what is about to be
 * saved, against the order saved on the server) and "Simulate server update" (another user changes the order while it
 * is open: Form Rebase merges it, conflicts are explained, nothing of the user's is lost). A new order is created
 * directly.
 */

type Args = SalesOrderCrudStoryProps & SalesOrderRebaseOptions;

/** The shell with the sales orders' two add-ons (review, rebase), per module (#519). */
function ProSalesOrders({ serverChange, serverUpdateDelayMs, simulateServerUpdate, onServerChange, ...crud }: Args) {
  // One hook for the life of the story; it reads the latest args through the ref.
  const options = useRef<SalesOrderRebaseOptions>({ serverChange, serverUpdateDelayMs, simulateServerUpdate, onServerChange });
  options.current = { serverChange, serverUpdateDelayMs, simulateServerUpdate, onServerChange };
  const [useAddons] = useState(() => salesOrderRebaseAddons(options));
  return <RecordCrud {...crud} module={SALES_ORDERS_CRUD} addons={{ [SALES_ORDERS_CRUD.name]: { reviewSave: salesOrderSaveReview, useAddons } }} />;
}

const meta: Meta<Args> = {
  title: 'Pro/Showcase/Record editing integrity',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The sales orders and the customers of `Showcase/Record editing` with the two Pro add-ons that protect an edit, on two records of different shape. **Review changes**: open an order, edit it, press Save and the dialog lists every change against the order saved on the server, with the field labels and readable values: the lines are matched by `id` and named by their product (a changed quantity is one entry for that line, a removed line is reported with the values it had, a mere reorder is said as such), amounts are in the order\'s currency. **Simulate server update**: another user changes the open order; the fields you did not touch take the server\'s values, a field you both changed is a conflict you settle with "Use server value" or "Keep mine", and the update never marks the form as edited. The `Customer` stories do the same on a customer: a nested billing address (`Billing address > Postal code`), contacts matched by `id` and named by their name (added, removed, edited and reordered told apart; a contact the server removes while you edit it is a conflict, never a silent loss), the account manager by name, the credit limit in the customer\'s currency, and a customer archived on the server while open (the fields become read-only, your changes stay visible and are listed as text you can copy). Controls: `serverChange` (what the other user changes), `serverUpdateDelayMs`, `saveDelayMs`, `saveOutcome`. The source is on [GitHub](' +
          githubSource(SHOWCASE_FOLDER) +
          '), built on the [Free showcase](' +
          githubSource('packages/core/src/showcase') +
          '); its add-on files are at the bottom of this page.',
      },
    },
  },
  // A showcase documents no component: every control is a knob of the demo.
  argTypes: storyControls({
    ...CRUD_ARGTYPES,
    serverChange: {
      control: 'select',
      options: SALES_ORDER_SERVER_CHANGES,
      description:
        'What "Simulate server update" changes on the stored order, as another user would: the status and the requested delivery, the quantity of line 1, line 1 removed, a line added (with an id the server issues), or the whole order deleted.',
    },
    serverUpdateDelayMs: {
      control: { type: 'range', min: 0, max: 5000, step: 250 },
      description: 'How long the simulated update takes to reach the server after the click (ms): time to go back to a field and keep typing.',
    },
    simulateServerUpdate: { control: 'boolean', description: 'Shows "Simulate server update" in the header of an existing order.' },
    onServerChange: { control: false, description: 'Called with every change of the open order the server announces (`{ id, record }`, `record: null` when deleted).' },
  }),
  args: { ...CRUD_ARGS, serverChange: 'status-and-delivery', serverUpdateDelayMs: 1000, simulateServerUpdate: true, onServerChange: fn() },
  render: (args) => <ProSalesOrders {...args} />,
};
export default meta;

type Story = StoryObj<Args>;
type Canvas = ReturnType<typeof within>;

/** so-1: EUR, invoiced, 3 lines, with notes. */
const ORDER = 'SO-2026-147000001';
/** so-13: USD, invoiced, 4 lines. */
const LINES_ORDER = 'SO-2026-161000013';
const FAST = { listLoadDelayMs: 0, recordLoadDelayMs: 0, saveDelayMs: 0, serverUpdateDelayMs: 0 } as const;

async function chooseOption(canvas: Canvas, field: RegExp | string, option: string) {
  await userEvent.click(await canvas.findByRole('combobox', { name: field }));
  await userEvent.click(await within(document.body).findByRole('option', { name: option }));
}

/** Opens an order from a clean list; returns the canvas. */
async function openOrder(canvasElement: HTMLElement, number = ORDER) {
  const canvas = within(canvasElement);
  const win = canvasElement.ownerDocument.defaultView;
  if (!win) throw new Error('Record editing integrity: no window');
  resetSalesOrders(win);
  await userEvent.click(await canvas.findByRole('link', { name: number }, { timeout: 5000 }));
  await canvas.findByRole('heading', { level: 1, name: new RegExp(number) });
  return canvas;
}

const storeOrder = (number: string) => mountedStore()?.snapshot().find((o) => o.number === number);
const productName = (number: string, line: number) => getProduct(storeOrder(number)?.lines[line]?.productId ?? '')?.name ?? '';
const changeList = (dialog: HTMLElement) => within(within(dialog).getByRole('list', { name: 'Changes to save' })).getAllByRole('listitem');

/** Line 2 quantity changed and line 1 removed: two entries, named by product, the removed one in the order's currency. */
async function editLines(canvas: Canvas) {
  const quantity = canvas.getByRole('textbox', { name: 'Line 2 quantity' });
  await userEvent.clear(quantity);
  await userEvent.type(quantity, '60');
  await userEvent.click(canvas.getByRole('button', { name: 'Remove line 1' }));
}

/**
 * The whole flow: open an order, change its Status and its Notes, Save -> "Review changes" lists exactly those two
 * changes (the status by its label) and nothing is saved yet; "Save changes" saves. Then a second edit: the review
 * lists ONLY that one, because it compares with the order the server saved, not with the one that was opened.
 * Back to the list: the row shows the new status.
 */
export const SalesOrderReviewChanges: Story = {
  tags: ['showcase-source'],
  parameters: showcaseSource(SHOWCASE_FOLDER, SOURCE_FILES),
  play: async ({ canvasElement, args }) => {
    const canvas = await openOrder(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const storedBefore = JSON.stringify(mountedStore()?.snapshot());

    await chooseOption(canvas, 'Status', 'Confirmed');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Notes' }), ' Checked by sales.');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
    const items = changeList(dialog);
    await expect(items).toHaveLength(2);
    await expect(items[0]).toHaveTextContent(/^Status.*changed.*Invoiced.*Confirmed/);
    await expect(items[1]).toHaveTextContent(/^Notes.*Checked by sales\.$/);
    // Reviewing is not saving.
    await expect(JSON.stringify(mountedStore()?.snapshot())).toBe(storedBefore);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    if (args.saveOutcome === 'error') {
      await expect(await canvas.findByText('Could not save the sales order: network error', undefined, { timeout: 5000 })).toBeVisible();
      await expect(args.onSaved).not.toHaveBeenCalled();
      return;
    }
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull(), { timeout: 5000 });
    await expect(args.onSaved).toHaveBeenCalledTimes(1);

    // A second edit after the save: the review compares with what the server saved, so only this one is listed.
    const reference = canvas.getByRole('textbox', { name: 'Customer reference' });
    await userEvent.clear(reference);
    await userEvent.type(reference, 'PO-7781');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const second = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(second).toHaveAccessibleDescription('1 change will be saved.');
    await expect(changeList(second)[0]).toHaveTextContent(/^Customer reference.*PO-7781$/);
    await userEvent.click(within(second).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull(), { timeout: 5000 });
    await expect(storeOrder(ORDER)).toMatchObject({ status: 'confirmed', customerReference: 'PO-7781' });

    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    const link = await canvas.findByRole('link', { name: ORDER }, { timeout: 5000 });
    await expect(link.closest('tr')).toHaveTextContent('Confirmed');
  },
};

/** The same story without a `play` function: what the e2e specs of #522 drive with real input. */
export const SalesOrderManual: Story = {};

/**
 * The lines in the review, on an order in US dollars: line 2's quantity changed, line 1 removed. The dialog lists ONE
 * entry per change, each line named by its product (never "Item 3"); the quantity change is on the same line although
 * it moved up when line 1 went away (lines are matched by id), and the removed line reads with its amounts in dollars.
 */
export const SalesOrderReviewLines: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = await openOrder(canvasElement, LINES_ORDER);
    const body = within(canvasElement.ownerDocument.body);
    const [first, second] = [productName(LINES_ORDER, 0), productName(LINES_ORDER, 1)];
    await editLines(canvas);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    const items = changeList(dialog);
    await expect(items[0]).toHaveTextContent(`Lines > Line 1 (${second}) > Quantity`);
    await expect(items[0]).toHaveTextContent(/changed.*50.*60/);
    await expect(items[1]).toHaveTextContent(`Lines > Line 1 (${first})`);
    await expect(items[1]).toHaveTextContent(`removed, ${first}, 50 × $61.30`);
    await expect(dialog).not.toHaveTextContent(/Item \d/);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    if (args.saveOutcome === 'error') return;
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull(), { timeout: 5000 });
    await expect(storeOrder(LINES_ORDER)?.lines.map((l) => l.quantity)).toEqual([60, 20, 1]);
  },
};

/**
 * Only the order of the lines changed: the form is edited but there is no entry to list. Save still opens the review,
 * with its own text instead of an empty list (the engine's `reorders`). "Keep editing" goes back to the form, still
 * edited, nothing saved.
 */
export const SalesOrderReviewOrderOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openOrder(canvasElement, LINES_ORDER);
    const body = within(canvasElement.ownerDocument.body);
    const storedBefore = JSON.stringify(mountedStore()?.snapshot());
    await userEvent.click(canvas.getByRole('button', { name: 'Move line 3 up' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription(ORDER_ONLY_DESCRIPTION);
    await expect(within(dialog).queryByRole('list')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(canvas.getByRole('region', { name: 'Save actions' })).toBeVisible();
    await expect(JSON.stringify(mountedStore()?.snapshot())).toBe(storedBefore);
  },
};

/**
 * Another user changes the order while it is open: type in the Notes and change the Requested delivery, then "Simulate
 * server update" (the server changes the Status and the Requested delivery). The Status takes the server's value, the
 * Notes stay yours, the Requested delivery is a conflict (no conflict on the Status: you did not touch it). "Keep mine
 * for Requested delivery" closes it. Save: the review lists your two changes, nothing of the server's; the store then
 * holds your values on top of the server's Status.
 */
export const SalesOrderServerUpdate: Story = {
  args: { ...FAST, serverChange: 'status-and-delivery' },
  play: async ({ canvasElement, args }) => {
    const canvas = await openOrder(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const notice = () => canvasElement.querySelector<HTMLElement>('.rop-pro-rebase-notice');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Notes' }), ' Call first.');
    const delivery = canvas.getByLabelText(/^Requested delivery/);
    fireEvent.change(delivery, { target: { value: '2026-07-01' } });

    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));
    const conflicts = await canvas.findByRole('list', { name: 'Conflicts' });
    await expect(args.onServerChange).toHaveBeenCalledTimes(1);
    await expect(within(conflicts).getAllByRole('listitem')).toHaveLength(1);
    await expect(within(conflicts).getByRole('listitem')).toHaveTextContent(/^Requested delivery Yours: Jul 1, 2026 Server: Jun 17, 2026/);
    await expect(notice()).toHaveTextContent(`${NOTICE_TITLE}1 field was updated.`);
    await expect(canvas.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Shipped');
    await expect(delivery).toHaveValue('2026-07-01');
    await expect(delivery).toHaveAccessibleDescription('Changed on the server too.');
    await expect((canvas.getByRole('textbox', { name: 'Notes' }) as HTMLInputElement).value.endsWith(' Call first.')).toBe(true);

    await userEvent.click(canvas.getByRole('button', { name: 'Keep mine for Requested delivery' }));
    await waitFor(() => expect(canvas.queryByRole('list', { name: 'Conflicts' })).toBeNull());
    await expect(delivery).toHaveValue('2026-07-01');

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    await expect(dialog).not.toHaveTextContent('Status');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    if (args.saveOutcome === 'error') return;
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull(), { timeout: 5000 });
    await waitFor(() => expect(notice()).toBeNull());
    const stored = storeOrder(ORDER);
    await expect(stored).toMatchObject({ status: 'shipped', requestedDeliveryDate: '2026-07-01' });
    await expect(stored?.notes.endsWith(' Call first.')).toBe(true);
  },
};

/* ------------------------------------------------------------------------------------------ */
/* Visual regression (3 viewports, via the `visual` tag).                                         */
/* ------------------------------------------------------------------------------------------ */

/** The review dialog over the order page: Status, Notes and two line changes on a USD order, Save pressed, not confirmed. */
export const SalesOrderReviewDialog: Story = {
  tags: ['visual'],
  args: { ...CRUD_VISUAL_ARGS, ...FAST, simulateServerUpdate: false },
  play: async ({ canvasElement }) => {
    const canvas = await openOrder(canvasElement, LINES_ORDER);
    const body = within(canvasElement.ownerDocument.body);
    await chooseOption(canvas, 'Status', 'Shipped');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Notes' }), 'Deliver in two parts.');
    await editLines(canvas);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('4 changes will be saved.');
    // `waitFor`: the dialog enters with an animation. The focus opens on "Keep editing" (`initialFocus`).
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
  },
};

/** The notice with two conflicts (Status and Requested delivery changed by both), above the order page. */
export const SalesOrderConflicts: Story = {
  tags: ['visual'],
  args: { ...CRUD_VISUAL_ARGS, ...FAST, serverChange: 'status-and-delivery' },
  play: async ({ canvasElement }) => {
    const canvas = await openOrder(canvasElement);
    await chooseOption(canvas, 'Status', 'Confirmed');
    fireEvent.change(canvas.getByLabelText(/^Requested delivery/), { target: { value: '2026-07-01' } });
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));
    const conflicts = await canvas.findByRole('list', { name: 'Conflicts' });
    await expect(within(conflicts).getAllByRole('listitem')).toHaveLength(2);
    await expect(canvas.getByRole('button', { name: 'Use all server values' })).toBeVisible();
  },
};

/* ------------------------------------------------------------------------------------------ */
/* #524: the customers, a record of another shape (nested address, contacts by id, a relation). */
/* ------------------------------------------------------------------------------------------ */

type CustomerArgs = CustomerCrudProps & CustomerRebaseOptions;
type CustomerStory = StoryObj<CustomerArgs>;

/** The shell with the customers' two add-ons (review, rebase) and the showcase's server rule on archived customers. */
function ProCustomers({ serverChange, serverUpdateDelayMs, simulateServerUpdate, onServerChange, history, listLoadDelayMs, recordLoadDelayMs, onNavigate, saveDelayMs, saveOutcome, onSaved }: CustomerArgs) {
  // One hook for the life of the story; it reads the latest args through the ref.
  const options = useRef<CustomerRebaseOptions>({ serverChange, serverUpdateDelayMs, simulateServerUpdate, onServerChange });
  options.current = { serverChange, serverUpdateDelayMs, simulateServerUpdate, onServerChange };
  const [useAddons] = useState(() => customerRebaseAddons(options));
  return (
    <RecordCrud
      module={CUSTOMERS_WITH_INTEGRITY}
      history={history}
      listLoadDelayMs={listLoadDelayMs}
      recordLoadDelayMs={recordLoadDelayMs}
      onNavigate={onNavigate}
      saveDelayMs={saveDelayMs}
      saveOutcome={saveOutcome}
      onSaved={onSaved}
      addons={{ [CUSTOMERS_WITH_INTEGRITY.name]: { reviewSave: customerSaveReview, useAddons } }}
    />
  );
}

/** The sales orders' controls the customers do not have (no creation, no deletion): out of the Controls panel. */
const NOT_FOR_CUSTOMERS = Object.fromEntries(['today', 'onCreated', 'deleteOutcome', 'onDeleted'].map((name) => [name, { table: { disable: true } }]));

const CUSTOMER_ARGTYPES = {
  ...storyControls({
    ...CUSTOMER_LIST_ARGTYPES,
    serverChange: {
      control: 'select',
      options: CUSTOMER_SERVER_CHANGES,
      description:
        'What "Simulate server update" changes on the stored customer, as another user would: the account manager (the next sales employee), the status (an active customer put on hold, an on-hold one made active), the e-mail of the primary contact, the last contact that is not the primary one removed, the last contact moved to the top, or the customer archived.',
    },
    serverUpdateDelayMs: {
      control: { type: 'range', min: 0, max: 5000, step: 250 },
      description: 'How long the simulated update takes to reach the server after the click (ms): time to go back to a field and keep typing.',
    },
    simulateServerUpdate: { control: 'boolean', description: 'Shows "Simulate server update" in the header of a customer.' },
    onServerChange: { control: false, description: 'Called with every change of the open customer the server announces (`{ id, record }`).' },
  }),
  ...NOT_FOR_CUSTOMERS,
};
const CUSTOMER_ARGS = { ...CUSTOMER_LIST_ARGS, serverChange: 'account-manager', serverUpdateDelayMs: 1000, simulateServerUpdate: true, onServerChange: fn() } satisfies CustomerArgs;
const FAST_CUSTOMERS = { listLoadDelayMs: 0, recordLoadDelayMs: 0, saveDelayMs: 0, serverUpdateDelayMs: 0 } as const;

const customerStory = (args: Partial<CustomerArgs> = {}): Pick<CustomerStory, 'argTypes' | 'args' | 'render'> => ({
  argTypes: CUSTOMER_ARGTYPES,
  args: { ...CUSTOMER_ARGS, ...args },
  render: (a) => <ProCustomers {...a} />,
});

/** cus-4: C-10004, EUR, active, 2 contacts (Matteo Gatti primary, Giulia Bellini). */
const CUSTOMER = 'C-10004';
/** cus-34: C-10034, USD, 4 contacts. */
const FOUR_CONTACTS = 'C-10034';

/** Opens a customer from a clean customer list; returns the canvas. */
async function openCustomer(canvasElement: HTMLElement, code = CUSTOMER) {
  const canvas = within(canvasElement);
  const win = canvasElement.ownerDocument.defaultView;
  if (!win) throw new Error('Record editing integrity: no window');
  resetCustomers(win);
  await userEvent.click(await canvas.findByRole('link', { name: code }, { timeout: 5000 }));
  await canvas.findByRole('heading', { level: 1, name: code });
  return canvas;
}

const storeCustomer = (code: string) => mountedCustomerStore()?.snapshot().find((c) => c.code === code);
const retype = async (field: HTMLElement, text: string) => {
  await userEvent.clear(field);
  await userEvent.type(field, text);
};
const managerName = (id: string) => accountManagerOptions().find((o) => o.value === id)?.label ?? id;
const saveBar = (canvas: Canvas) => canvas.queryByRole('region', { name: 'Save actions' });
/** The message of a customer archived on the server (focusable from script only), found by its title. */
const archivedStrip = (title: HTMLElement) => title.closest<HTMLElement>('[tabindex="-1"]')!;

/**
 * The whole flow on a customer: change the Postal code of the billing address (a nested field) and the e-mail of the
 * second contact, Save -> "Review changes" lists exactly those two, with readable labels (`Billing address > Postal
 * code`, the contact by its name, never "Item 2"); nothing is saved yet; "Save changes" saves. Then another account
 * manager: the review lists ONLY that one, by name, because it compares with the customer the server saved. Back to
 * the list: the row shows the new account manager.
 */
export const CustomerReviewChanges: CustomerStory = {
  ...customerStory(),
  play: async ({ canvasElement, args }) => {
    const canvas = await openCustomer(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const storedBefore = JSON.stringify(mountedCustomerStore()?.snapshot());

    await retype(canvas.getByRole('textbox', { name: 'Postal code' }), '40121');
    await retype(canvas.getByRole('textbox', { name: 'Contact 2 e-mail' }), 'g.bellini@borgavella-tooling.example');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
    const items = changeList(dialog);
    await expect(items).toHaveLength(2);
    await expect(items[0]).toHaveTextContent(/^Billing address > Postal code.*changed.*40139.*40121$/);
    await expect(items[1]).toHaveTextContent(/^Contacts > Contact 2 \(Giulia Bellini\) > E-mail.*g\.bellini@borgavella-tooling\.example$/);
    await expect(dialog).not.toHaveTextContent(/Item \d/);
    // Reviewing is not saving.
    await expect(JSON.stringify(mountedCustomerStore()?.snapshot())).toBe(storedBefore);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    if (args.saveOutcome === 'error') {
      await expect(await canvas.findByText('Could not save the customer: network error', undefined, { timeout: 5000 })).toBeVisible();
      await expect(args.onSaved).not.toHaveBeenCalled();
      return;
    }
    await waitFor(() => expect(saveBar(canvas)).toBeNull(), { timeout: 5000 });
    await expect(args.onSaved).toHaveBeenCalledTimes(1);

    // A second edit after the save: the review compares with what the server saved, so only this one is listed.
    const saved = storeCustomer(CUSTOMER)!;
    const other = accountManagerOptions().find((o) => o.value !== saved.accountManagerId)!;
    await chooseOption(canvas, 'Account manager', other.label);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const second = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(second).toHaveAccessibleDescription('1 change will be saved.');
    await expect(changeList(second)[0]).toHaveTextContent(new RegExp(`^Account manager.*changed.*${managerName(saved.accountManagerId)}.*${other.label}$`));
    await expect(second).not.toHaveTextContent(/emp-\d/);
    await userEvent.click(within(second).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(saveBar(canvas)).toBeNull(), { timeout: 5000 });
    await expect(storeCustomer(CUSTOMER)).toMatchObject({ accountManagerId: other.value, billingAddress: expect.objectContaining({ postalCode: '40121' }) });

    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    const link = await canvas.findByRole('link', { name: CUSTOMER }, { timeout: 5000 });
    await expect(link.closest('tr')).toHaveTextContent(other.label);
  },
};

/** The customer stories without a `play` function: what `e2e/showcase-pro-customers.spec.ts` drives with real input. */
export const CustomerManual: CustomerStory = { ...customerStory() };

/**
 * The contacts in the review, on a customer with four: contact 3's role edited, contact 2 removed, a new contact
 * added. The dialog lists ONE entry per change, each contact by its name: the edit stays on its contact although it
 * moved up when contact 2 went away (contacts are matched by id), the removed one reads with the values it had, the
 * new one as a whole. (A mere reorder of the contacts, which the page offers no control for, would read "Only the
 * order of the contacts changed.": see the unit tests.)
 */
export const CustomerReviewContacts: CustomerStory = {
  ...customerStory(),
  play: async ({ canvasElement, args }) => {
    const canvas = await openCustomer(canvasElement, FOUR_CONTACTS);
    const body = within(canvasElement.ownerDocument.body);
    const [, second, third] = storeCustomer(FOUR_CONTACTS)!.contacts;
    await retype(canvas.getByRole('textbox', { name: 'Contact 3 role' }), 'Lead Site Engineer');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove contact 2' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add contact' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Contact 4 name' }), 'Ilse Visser');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Contact 4 e-mail' }), 'ilse.visser@company.example');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('3 changes will be saved.');
    const items = changeList(dialog);
    await expect(items[0]).toHaveTextContent(`Contacts > Contact 2 (${third!.name}) > Role`);
    await expect(items[0]).toHaveTextContent(/changed.*Site Engineer.*Lead Site Engineer$/);
    await expect(items[1]).toHaveTextContent('Contacts > Contact 4 (Ilse Visser)');
    await expect(items[1]).toHaveTextContent(/added.*Ilse Visser, ilse\.visser@company\.example$/);
    await expect(items[2]).toHaveTextContent(`Contacts > Contact 2 (${second!.name})`);
    await expect(items[2]).toHaveTextContent(`removed, ${second!.name} (${second!.role}), ${second!.email}`);
    await expect(dialog).not.toHaveTextContent(/Item \d/);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    if (args.saveOutcome === 'error') return;
    await waitFor(() => expect(saveBar(canvas)).toBeNull(), { timeout: 5000 });
    await expect(storeCustomer(FOUR_CONTACTS)?.contacts.map((c) => c.id)).toEqual(['cus-34-con-1', 'cus-34-con-3', 'cus-34-con-4', 'new-contact-1']);
  },
};

/**
 * Another user changes the customer while it is open: edit the Street of the billing address and the e-mail of the
 * primary contact, then "Simulate server update" (the server changes that same e-mail). The Street stays yours, the
 * e-mail is a conflict with both versions and the Field says so. "Keep mine" closes it. Save: the review lists your two
 * changes, nothing of the server's.
 */
export const CustomerServerUpdate: CustomerStory = {
  ...customerStory({ ...FAST_CUSTOMERS, serverChange: 'primary-contact-email' }),
  play: async ({ canvasElement, args }) => {
    const canvas = await openCustomer(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const primary = storeCustomer(CUSTOMER)!.contacts[0]!;
    const street = canvas.getByRole('textbox', { name: 'Street' });
    await retype(street, 'Via del Lavoro 3');
    const email = canvas.getByRole('textbox', { name: 'Contact 1 e-mail' });
    await retype(email, 'matteo@borgavella-tooling.example');

    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));
    const conflicts = await canvas.findByRole('list', { name: 'Conflicts' });
    await expect(args.onServerChange).toHaveBeenCalledTimes(1);
    await expect(within(conflicts).getAllByRole('listitem')).toHaveLength(1);
    await expect(within(conflicts).getByRole('listitem')).toHaveTextContent(
      `Contacts > Contact 1 (${primary.name}) > E-mail Yours: matteo@borgavella-tooling.example Server: ${serverEmail(primary.email)}`,
    );
    await expect(canvasElement.querySelector('.rop-pro-rebase-notice')).toHaveTextContent(CUSTOMER_NOTICE_TITLE);
    await expect(email).toHaveAccessibleDescription('Changed on the server too.');
    await expect(street).toHaveValue('Via del Lavoro 3');
    await expect(street).not.toHaveAccessibleDescription('Changed on the server too.');

    await userEvent.click(canvas.getByRole('button', { name: `Keep mine for Contacts > Contact 1 (${primary.name}) > E-mail` }));
    await waitFor(() => expect(canvas.queryByRole('list', { name: 'Conflicts' })).toBeNull());
    await expect(email).toHaveValue('matteo@borgavella-tooling.example');

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    // Against the customer the server holds now: the e-mail is mine over the server's (the conflict was kept).
    await expect(changeList(dialog)[1]).toHaveTextContent(`Contacts > Contact 1 (${primary.name}) > E-mail`);
    await expect(changeList(dialog)[1]).toHaveTextContent(new RegExp(`${serverEmail(primary.email).replace(/\./g, '\\.')}.*matteo@borgavella-tooling\\.example$`));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    if (args.saveOutcome === 'error') return;
    await waitFor(() => expect(saveBar(canvas)).toBeNull(), { timeout: 5000 });
    await expect(storeCustomer(CUSTOMER)?.billingAddress.line1).toBe('Via del Lavoro 3');
    await expect(storeCustomer(CUSTOMER)?.contacts[0]?.email).toBe('matteo@borgavella-tooling.example');
  },
};

/**
 * The customer is archived on the server while you edit it: change the City and the role of the second contact,
 * "Simulate server update" (archive, after a short delay), go back to the role field. When the archiving lands every
 * field becomes disabled, so the focus moves to the message that says why; your two changes are still in the fields
 * and are listed in the message as text you can copy. Save: the review says they can no longer be saved and the server
 * refuses. "Restore" makes the customer active again (the changes are discarded, as the message said).
 */
export const CustomerArchivedRemotely: CustomerStory = {
  ...customerStory({ ...FAST_CUSTOMERS, serverChange: 'archive', serverUpdateDelayMs: 600 }),
  play: async ({ canvasElement }) => {
    const canvas = await openCustomer(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const before = storeCustomer(CUSTOMER)!;
    const city = canvas.getByRole('textbox', { name: 'City' });
    await retype(city, 'Modena');
    const role = canvas.getByRole('textbox', { name: 'Contact 2 role' });
    await retype(role, 'Senior Buyer');

    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));
    await userEvent.click(role);
    const strip = archivedStrip(await canvas.findByText(ARCHIVED_TITLE, undefined, { timeout: 5000 }));
    await waitFor(() => expect(strip).toHaveFocus());
    await expect(role).toBeDisabled();
    await expect(city).toBeDisabled();
    await expect(canvas.getByRole('combobox', { name: 'Account manager' })).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: 'Add contact' })).toBeNull();
    await expect(city).toHaveValue('Modena');
    await expect(role).toHaveValue('Senior Buyer');
    const unsaved = within(within(strip).getByRole('list', { name: UNSAVED_LIST_LABEL })).getAllByRole('listitem');
    await expect(unsaved).toHaveLength(2);
    await expect(unsaved[0]).toHaveTextContent(/^Billing address > City.*Modena$/);
    await expect(unsaved[1]).toHaveTextContent(/^Contacts > Contact 2 \(Giulia Bellini\) > Role.*Senior Buyer$/);

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription(ARCHIVED_REVIEW_DESCRIPTION);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(await canvas.findByText(ARCHIVED_SAVE_ERROR, undefined, { timeout: 5000 })).toBeVisible();
    await expect(storeCustomer(CUSTOMER)).toEqual({ ...before, status: 'archived' });

    await userEvent.click(await canvas.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'City' })).toBeEnabled(), { timeout: 5000 });
    await expect(canvas.queryByText(ARCHIVED_TITLE)).toBeNull();
    await expect(storeCustomer(CUSTOMER)).toEqual(before);
  },
};

// Visual states of the customers (3 viewports, via the `visual` tag).

/** The review dialog over a customer page: the address, a contact's e-mail, the credit limit, the account manager and a removed contact, on a customer in dollars. */
export const CustomerReviewDialog: CustomerStory = {
  tags: ['visual'],
  ...customerStory({ ...CUSTOMER_VISUAL_ARGS, ...FAST_CUSTOMERS, simulateServerUpdate: false }),
  play: async ({ canvasElement }) => {
    const canvas = await openCustomer(canvasElement, FOUR_CONTACTS);
    const body = within(canvasElement.ownerDocument.body);
    const saved = storeCustomer(FOUR_CONTACTS)!;
    await retype(canvas.getByRole('textbox', { name: 'Postal code' }), '28226');
    await retype(canvas.getByRole('textbox', { name: 'Contact 2 e-mail' }), 'r.navarro@glenquarry-construction.example');
    await retype(canvas.getByRole('textbox', { name: /^Credit limit/ }), '125000');
    await chooseOption(canvas, 'Account manager', managerName(nextAccountManager(saved.accountManagerId)));
    await userEvent.click(canvas.getByRole('button', { name: 'Remove contact 4' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const dialog = await body.findByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toHaveAccessibleDescription('5 changes will be saved.');
    // `waitFor`: the dialog enters with an animation. The focus opens on "Keep editing" (`initialFocus`).
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
  },
};

/** A customer archived on the server under two edits: the message with the unsaved changes, every field disabled. */
export const CustomerArchivedNotice: CustomerStory = {
  tags: ['visual'],
  ...customerStory({ ...CUSTOMER_VISUAL_ARGS, ...FAST_CUSTOMERS, serverChange: 'archive' }),
  play: async ({ canvasElement }) => {
    const canvas = await openCustomer(canvasElement);
    await retype(canvas.getByRole('textbox', { name: 'City' }), 'Modena');
    await retype(canvas.getByRole('textbox', { name: 'Contact 2 role' }), 'Senior Buyer');
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate server update' }));
    const strip = archivedStrip(await canvas.findByText(ARCHIVED_TITLE));
    await expect(within(strip).getAllByRole('listitem')).toHaveLength(2);
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'City' })).toBeDisabled());
  },
};
