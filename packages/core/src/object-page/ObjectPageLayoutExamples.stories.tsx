import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import {
  COURSE_STATUS_LABEL,
  COURSE_STATUS_TONE,
  DEPARTMENT_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_TONE,
  PURCHASE_ORDER_STATUS_LABEL,
  PURCHASE_ORDER_STATUS_TONE,
  getCourse,
  getEmployee,
  getProduct,
  getPurchaseOrder,
  getSupplier,
  lineTotalMinor,
} from '../internal/demo-data';
import { storyControl } from '../internal/story-docs';
import { useCaseStory as describeUseCase } from '../internal/story-example';
import { Select } from '../select/Select';
import { StatusBadge } from '../status-badge/StatusBadge';
import { ObjectPage } from './ObjectPage';
import { ObjectPageFooter } from './ObjectPageFooter';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';
import { useDirtyGuard } from './use-dirty-guard';
import { useObjectPageForm } from './use-object-page-form';

// "Example: configured for ..." (ticket #529): the same Object Page composition (header, sections, save bar,
// dirty guard) on three records of different shape. They live in their own file because the Docs page of
// `Floorplans/Object Page/Layout` shows the neutral stories of `ObjectPage.stories.tsx` first and these use
// cases after (#624); their Controls and Actions must not mix with the neutral Playground's.
// Each story declares its component inside `render` (`function XyzDemo() {...}; return <XyzDemo {...args} />`),
// the shape for which "Show code" prints the story's source (.storybook/source-transform.ts): the sections, the
// fields and the actions are what changes between verticals, and what the reader needs to see.

const meta: Meta = {
  title: 'Floorplans/Object Page/Layout',
  parameters: { layout: 'fullscreen' },
};

export default meta;

const CALLBACKS = {
  onSave: { control: false, description: 'Called with the values when "Save" succeeds (the save handler of `useObjectPageForm`).' },
  onLeave: { control: false, description: 'The guarded exit, `guard(onLeave)`: called only when the exit is confirmed (or at once when nothing changed).' },
} as const;

/**
 * For the plays only. Edits `field` and checks, in this order: the save bar is not there on arrival (the record
 * was mounted already hydrated, so the form is clean), it shows without moving anything (its room was reserved),
 * and the dirty guard asks before leaving ("Keep editing" brings the focus back to the opener, "Leave without
 * saving" runs the exit once). The node `field` is the one found BEFORE the edit: its accessible name is not
 * looked up again afterwards.
 */
async function editAndLeave(canvasElement: HTMLElement, field: HTMLElement, typed: string, onLeave: () => void): Promise<void> {
  const canvas = within(canvasElement);
  const body = within(document.body);
  const scroller = canvasElement.querySelector('[data-object-page-scroller]') as HTMLElement;
  const title = canvas.getByRole('heading', { level: 1 });
  // The title's place inside the scrolled content (the scroll offset added back: typing into a field far down
  // scrolls it into view, which is not a jump) and the bottom edge of the scroller.
  const placement = () => [
    Math.round(title.getBoundingClientRect().top + scroller.scrollTop),
    Math.round(scroller.getBoundingClientRect().bottom),
  ];

  // No echo of the hydration: nothing is dirty after the data arrived.
  await expect(canvas.queryByRole('region', { name: 'Save actions' })).toBeNull();
  const before = placement();
  await userEvent.type(field, typed);
  await expect(canvas.getByRole('region', { name: 'Save actions' })).toBeVisible();
  await expect(placement()).toEqual(before);

  const opener = canvas.getByRole('button', { name: 'Back to list' });
  await userEvent.click(opener);
  const dialog = await body.findByRole('dialog', { name: 'Unsaved changes' });
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
  await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
  await expect(onLeave).not.toHaveBeenCalled();
  await waitFor(() => expect(opener).toHaveFocus());

  await userEvent.click(opener);
  await userEvent.click(await body.findByRole('button', { name: 'Leave without saving' }));
  await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
  await expect(onLeave).toHaveBeenCalledTimes(1);
}

// ---- 1. HR: personal, job, address; the manager is a relation -----------------------------------------------

interface HrArgs {
  showAddress: boolean;
  onSave: (values: object) => void;
  onLeave: () => void;
}

const EMPLOYEE = getEmployee('emp-30')!;
const MANAGERS = ['emp-1', 'emp-2', 'emp-3', 'emp-4', 'emp-5', 'emp-6'].map((id) => ({ value: id, label: getEmployee(id)!.fullName }));

/**
 * Employee record: three sections (Personal, Job, Address), the manager held as an id and shown as a name, and an
 * Address section the Controls can drop. The save bar and the dirty guard are the ones of every Object Page.
 * Controls: `showAddress`. The play function edits the job title: the save bar appears with nothing moving, the
 * guard asks before "Back to list", "Keep editing" returns the focus to the button and "Leave without saving"
 * runs the exit once.
 */
export const UseCaseHrEmployee: StoryObj<HrArgs> = {
  name: 'Example: configured for an HR employee record',
  tags: ['use-case', 'vertical:hr', 'visual'],
  ...describeUseCase({
    vertical: 'hr',
    problem: 'An HR officer corrects an employee\'s job title or line manager and must not lose the change by leaving the page by mistake.',
    configuration:
      'Three `ObjectPageSection`s (Personal, Job, Address) with the employee\'s own fields; the manager is stored as an id (`managerId`) and the `Select` shows the name of that id. The save bar and the guard are unchanged: only the sections, the fields and the header actions differ from the neutral record.',
  }),
  argTypes: {
    showAddress: storyControl({ control: 'boolean', description: 'Renders the "Address" section (one `ObjectPageSection` more or less; the anchor bar follows).' }),
    ...CALLBACKS,
  },
  args: { showAddress: true, onSave: fn(), onLeave: fn() },
  render: (args) => {
    function HrEmployeeDemo({ showAddress, onSave, onLeave }: HrArgs) {
      // Mounted already hydrated: the baseline is the saved record, so `isDirty` is false until the user edits.
      const form = useObjectPageForm({
        baseline: {
          firstName: EMPLOYEE.firstName,
          lastName: EMPLOYEE.lastName,
          email: EMPLOYEE.email,
          jobTitle: EMPLOYEE.title,
          department: DEPARTMENT_LABEL[EMPLOYEE.department],
          // An employee with no manager has no value (`undefined` = nothing selected), not an empty string.
          managerId: EMPLOYEE.managerId ?? undefined,
          hireDate: EMPLOYEE.hireDate,
          street: '12 Harbour Street',
          postalCode: '3011',
          city: 'Rotterdam',
          country: 'NL',
        },
      });
      const { guard, dialog } = useDirtyGuard({ when: form.isDirty });
      const text = (name: keyof typeof form.values, label: string) => (
        <Field label={label} name={name}>
          <Input value={form.values[name]} onChange={(event) => form.setValue(name, event.target.value)} />
        </Field>
      );
      return (
        <div style={{ height: '100dvh' }}>
          <ObjectPage>
            <ObjectPageHeader
              title={`Employee ${EMPLOYEE.code}`}
              subtitle={EMPLOYEE.fullName}
              status={<StatusBadge tone={EMPLOYEE_STATUS_TONE[EMPLOYEE.status]}>{EMPLOYEE_STATUS_LABEL[EMPLOYEE.status]}</StatusBadge>}
              actions={
                <Button variant="secondary" onClick={() => guard(onLeave)}>
                  Back to list
                </Button>
              }
            />
            <ObjectPageSection id="personal" title="Personal">
              <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
                {text('firstName', 'First name')}
                {text('lastName', 'Last name')}
                {text('email', 'Work email')}
              </div>
            </ObjectPageSection>
            <ObjectPageSection id="job" title="Job">
              <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
                {text('jobTitle', 'Job title')}
                {text('department', 'Department')}
                <Field label="Manager" name="managerId" help="Stored as an id, shown as a name.">
                  <Select options={MANAGERS} value={form.values.managerId} onValueChange={(id) => form.setValue('managerId', id)} />
                </Field>
                {text('hireDate', 'Hire date')}
              </div>
            </ObjectPageSection>
            {showAddress ? (
              <ObjectPageSection id="address" title="Address">
                <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
                  {text('street', 'Street')}
                  {text('postalCode', 'Postal code')}
                  {text('city', 'City')}
                  {text('country', 'Country')}
                </div>
              </ObjectPageSection>
            ) : null}
            <ObjectPageFooter visible={form.isDirty} label="Save actions">
              <Button variant="secondary" onClick={() => form.reset()}>
                Discard changes
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  void form.save(async (values) => {
                    onSave(values);
                    return values;
                  })
                }
              >
                Save
              </Button>
            </ObjectPageFooter>
          </ObjectPage>
          {dialog}
        </div>
      );
    }
    return <HrEmployeeDemo {...args} />;
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: `Employee ${EMPLOYEE.code}` })).toBeInTheDocument();
    for (const name of args.showAddress ? ['Personal', 'Job', 'Address'] : ['Personal', 'Job']) {
      await expect(canvas.getByRole('region', { name })).toBeInTheDocument();
    }
    await expect(canvas.queryByRole('region', { name: 'Address' }) !== null).toBe(args.showAddress);
    // The relation: the id is held, the name is shown.
    await expect(canvas.getByRole('combobox', { name: /Manager/ })).toHaveTextContent(getEmployee(EMPLOYEE.managerId!)!.fullName);
    await editAndLeave(canvasElement, canvas.getByRole('textbox', { name: 'Job title' }), ' II', args.onLeave);
  },
};

// ---- 2. E-learning: overview, a list of modules, pricing per currency ---------------------------------------

type PricingCurrencies = 'all' | 'EUR' | 'JPY';

interface CourseArgs {
  pricing: PricingCurrencies;
  onSave: (values: object) => void;
  onLeave: () => void;
}

const COURSE = getCourse('crs-7')!;

/**
 * Course record: an Overview section, a Modules section that is a list (one field per module, in teaching order)
 * and a Pricing section with one price per currency (yen have no decimals). Controls: `pricing` (all four prices, or only euro or
 * yen). The play function edits the title of the first module: the save bar appears with nothing
 * moving, the guard asks before "Back to list", "Keep editing" returns the focus to the button and "Leave without
 * saving" runs the exit once.
 */
export const UseCaseElearningCourse: StoryObj<CourseArgs> = {
  name: 'Example: configured for an e-learning course',
  tags: ['use-case', 'vertical:e-learning', 'visual'],
  ...describeUseCase({
    vertical: 'e-learning',
    problem: 'A course author renames a module or reprices the course for one market and must see at once what is unsaved.',
    configuration:
      'Overview, Modules and Pricing sections. The modules are a list rendered with `map`, one `Field` per module with the module id in its `name`; the prices are one `Field` per currency, each formatted with the decimals of its currency. The form hook and the save bar are the same as on the neutral record.',
  }),
  argTypes: {
    pricing: storyControl({ control: 'radio', options: ['all', 'EUR', 'JPY'], description: 'The currencies the "Pricing" section lists, one price `Field` each: all four, or only euro or yen.' }),
    ...CALLBACKS,
  },
  args: { pricing: 'all', onSave: fn(), onLeave: fn() },
  render: (args) => {
    function ElearningCourseDemo({ pricing, onSave, onLeave }: CourseArgs) {
      const currencies = pricing === 'all' ? (['EUR', 'USD', 'GBP', 'JPY'] as const) : ([pricing] as const);
      const form = useObjectPageForm({
        baseline: {
          title: COURSE.title,
          code: COURSE.code,
          // One title per module, keyed by the module id: the list keeps its order, the edits stay on their own row.
          modules: Object.fromEntries(COURSE.modules.map((module) => [module.id, module.title])),
          // Prices in major units, as a person types them: yen have none after the point.
          prices: Object.fromEntries(
            (['EUR', 'USD', 'GBP', 'JPY'] as const).map((currency) => {
              const digits = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
              return [currency, (COURSE.listPriceMinor[currency] / 10 ** digits).toFixed(digits)];
            }),
          ),
        },
      });
      const { guard, dialog } = useDirtyGuard({ when: form.isDirty });
      return (
        <div style={{ height: '100dvh' }}>
          <ObjectPage>
            <ObjectPageHeader
              title={`Course ${COURSE.code}`}
              subtitle={COURSE.title}
              status={<StatusBadge tone={COURSE_STATUS_TONE[COURSE.status]}>{COURSE_STATUS_LABEL[COURSE.status]}</StatusBadge>}
              actions={
                <Button variant="secondary" onClick={() => guard(onLeave)}>
                  Back to list
                </Button>
              }
            />
            <ObjectPageSection id="overview" title="Overview">
              <div style={{ display: 'grid', gap: 16, maxWidth: 520 }}>
                <Field label="Course title" name="title">
                  <Input value={form.values.title} onChange={(event) => form.setValue('title', event.target.value)} />
                </Field>
                <Field label="Catalogue code" name="code" state="locked" stateReason="Assigned by the catalogue when the course is created.">
                  <Input value={form.values.code} />
                </Field>
              </div>
            </ObjectPageSection>
            <ObjectPageSection id="modules" title="Modules">
              <div style={{ display: 'grid', gap: 16, maxWidth: 520 }}>
                {COURSE.modules.map((module, index) => (
                  <Field key={module.id} label={`Module ${index + 1} title`} name={`modules.${module.id}`} help={`${module.minutes} minutes`}>
                    <Input
                      value={form.values.modules[module.id]}
                      onChange={(event) => form.setValue('modules', { ...form.values.modules, [module.id]: event.target.value })}
                    />
                  </Field>
                ))}
              </div>
            </ObjectPageSection>
            <ObjectPageSection id="pricing" title="Pricing">
              <div style={{ display: 'grid', gap: 16, maxWidth: 260 }}>
                {currencies.map((currency) => (
                  <Field key={currency} label={`Price per seat (${currency})`} name={`prices.${currency}`}>
                    <Input
                      inputMode="decimal"
                      value={form.values.prices[currency]}
                      onChange={(event) => form.setValue('prices', { ...form.values.prices, [currency]: event.target.value })}
                    />
                  </Field>
                ))}
              </div>
            </ObjectPageSection>
            <ObjectPageFooter visible={form.isDirty} label="Save actions">
              <Button variant="secondary" onClick={() => form.reset()}>
                Discard changes
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  void form.save(async (values) => {
                    onSave(values);
                    return values;
                  })
                }
              >
                Save
              </Button>
            </ObjectPageFooter>
          </ObjectPage>
          {dialog}
        </div>
      );
    }
    return <ElearningCourseDemo {...args} />;
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ['Overview', 'Modules', 'Pricing']) await expect(canvas.getByRole('region', { name })).toBeInTheDocument();
    for (const [index, module] of COURSE.modules.entries()) {
      await expect(canvas.getByRole('textbox', { name: `Module ${index + 1} title` })).toHaveValue(module.title);
    }
    // Yen have no decimals; the other currencies have two.
    const yen = canvas.queryByRole('textbox', { name: 'Price per seat (JPY)' });
    if (args.pricing !== 'EUR') await expect(yen).toHaveValue(String(COURSE.listPriceMinor.JPY));
    else await expect(yen).toBeNull();
    // The locked catalogue code is focusable and read-only, with its reason read by assistive technology.
    const code = canvas.getByRole('textbox', { name: 'Catalogue code' });
    await expect(code).toHaveAttribute('readonly');
    await expect(code).toHaveAccessibleDescription(/Assigned by the catalogue/);
    await editAndLeave(canvasElement, canvas.getByRole('textbox', { name: 'Module 1 title' }), ' (revised)', args.onLeave);
  },
};

// ---- 3. ERP: header, lines with totals, delivery -----------------------------------------------------------

interface PurchaseOrderArgs {
  showDelivery: boolean;
  onSave: (values: object) => void;
  onLeave: () => void;
}

// A yen order: its amounts have no decimals.
const ORDER = getPurchaseOrder('po-31')!;
const SUPPLIER_NAME = getSupplier(ORDER.supplierId)?.name ?? ORDER.supplierId;
const PRODUCT_NAME: Record<string, string> = Object.fromEntries(ORDER.lines.map((line) => [line.id, getProduct(line.productId)?.name ?? line.productId]));

/**
 * Purchase order: a Header section whose number and supplier are locked (each with its reason), a Lines section
 * with an editable quantity and a total per line, and a Delivery section. The order is in yen: line totals and
 * the order total have no decimals. Controls: `showDelivery`. The play function edits the quantity of the first line:
 * its total and the order total follow, the save bar appears with nothing moving, the guard asks before "Back to
 * list" and "Leave without saving" runs the exit once.
 */
export const UseCaseErpPurchaseOrder: StoryObj<PurchaseOrderArgs> = {
  name: 'Example: configured for an ERP purchase order',
  tags: ['use-case', 'vertical:erp', 'visual'],
  ...describeUseCase({
    vertical: 'erp',
    problem: 'A buyer changes the quantity on an order line before it is sent, and the totals must follow while the number and the supplier stay fixed.',
    configuration:
      'Header, Lines and Delivery sections. The number and the supplier are `Field`s with `state="locked"` and a `stateReason`; the lines are a list of rows whose quantity is in the form values and whose total is computed from it with the currency of the order (`Intl.NumberFormat` gives yen no decimals). `showDelivery` adds or drops the Delivery section.',
  }),
  argTypes: {
    showDelivery: storyControl({ control: 'boolean', description: 'Renders the "Delivery" section (one `ObjectPageSection` more or less; the anchor bar follows).' }),
    ...CALLBACKS,
  },
  args: { showDelivery: true, onSave: fn(), onLeave: fn() },
  render: (args) => {
    function ErpPurchaseOrderDemo({ showDelivery, onSave, onLeave }: PurchaseOrderArgs) {
      const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: ORDER.currency });
      const digits = money.resolvedOptions().maximumFractionDigits ?? 2;
      const format = (minor: number) => money.format(minor / 10 ** digits);
      const form = useObjectPageForm({
        baseline: {
          orderDate: ORDER.orderDate,
          expectedDelivery: ORDER.expectedDeliveryDate,
          deliveryNotes: '',
          quantities: Object.fromEntries(ORDER.lines.map((line) => [line.id, String(line.quantity)])),
        },
      });
      const { guard, dialog } = useDirtyGuard({ when: form.isDirty });
      const lineTotals = ORDER.lines.map((line) => {
        const quantity = Number.parseInt(form.values.quantities[line.id] ?? '', 10);
        if (!Number.isFinite(quantity)) return 0;
        // quantity x unit price, less the discount rounded half-up (the rule of the fixture).
        const gross = quantity * line.unitPriceMinor;
        return gross - Math.round((gross * line.discountPercent) / 100);
      });
      const orderTotal = lineTotals.reduce((sum, total) => sum + total, 0);
      return (
        <div style={{ height: '100dvh' }}>
          <ObjectPage>
            <ObjectPageHeader
              title={`Purchase order ${ORDER.number}`}
              subtitle={SUPPLIER_NAME}
              status={<StatusBadge tone={PURCHASE_ORDER_STATUS_TONE[ORDER.status]}>{PURCHASE_ORDER_STATUS_LABEL[ORDER.status]}</StatusBadge>}
              actions={
                <Button variant="secondary" onClick={() => guard(onLeave)}>
                  Back to list
                </Button>
              }
            />
            <ObjectPageSection id="header" title="Header">
              <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
                <Field label="Order number" state="locked" stateReason="Assigned when the order is created.">
                  <Input value={ORDER.number} />
                </Field>
                <Field label="Supplier" state="locked" stateReason="Changing the supplier means creating a new order.">
                  <Input value={SUPPLIER_NAME} />
                </Field>
                <Field label="Order date" name="orderDate">
                  <Input value={form.values.orderDate} onChange={(event) => form.setValue('orderDate', event.target.value)} />
                </Field>
              </div>
            </ObjectPageSection>
            <ObjectPageSection id="lines" title="Lines">
              <div style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
                {ORDER.lines.map((line, index) => (
                  // Wraps on a narrow screen: the product name takes a row, quantity and total the next one.
                  <div key={line.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <span style={{ flex: '1 1 220px', minWidth: 0 }}>{PRODUCT_NAME[line.id]}</span>
                    <div style={{ flex: '0 0 110px', position: 'relative' }}>
                      <Field label={`Quantity of ${PRODUCT_NAME[line.id]}`} name={`quantities.${line.id}`} hideLabel reserveMessageSpace={false}>
                        <Input
                          inputMode="numeric"
                          value={form.values.quantities[line.id]}
                          onChange={(event) => form.setValue('quantities', { ...form.values.quantities, [line.id]: event.target.value })}
                        />
                      </Field>
                    </div>
                    <output aria-label={`Total of ${PRODUCT_NAME[line.id]}`} style={{ flex: '0 0 120px', textAlign: 'end' }}>
                      {format(lineTotals[index] ?? 0)}
                    </output>
                  </div>
                ))}
                <output aria-label="Order total" style={{ textAlign: 'end', fontWeight: 600 }}>
                  {format(orderTotal)}
                </output>
              </div>
            </ObjectPageSection>
            {showDelivery ? (
              <ObjectPageSection id="delivery" title="Delivery">
                <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
                  <Field label="Expected delivery" name="expectedDelivery">
                    <Input value={form.values.expectedDelivery} onChange={(event) => form.setValue('expectedDelivery', event.target.value)} />
                  </Field>
                  <Field label="Delivery notes" name="deliveryNotes">
                    <Input value={form.values.deliveryNotes} onChange={(event) => form.setValue('deliveryNotes', event.target.value)} />
                  </Field>
                </div>
              </ObjectPageSection>
            ) : null}
            <ObjectPageFooter visible={form.isDirty} label="Save actions">
              <Button variant="secondary" onClick={() => form.reset()}>
                Discard changes
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  void form.save(async (values) => {
                    onSave(values);
                    return values;
                  })
                }
              >
                Save
              </Button>
            </ObjectPageFooter>
          </ObjectPage>
          {dialog}
        </div>
      );
    }
    return <ErpPurchaseOrderDemo {...args} />;
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: ORDER.currency });
    const format = (minor: number) => money.format(minor);
    for (const name of args.showDelivery ? ['Header', 'Lines', 'Delivery'] : ['Header', 'Lines']) {
      await expect(canvas.getByRole('region', { name })).toBeInTheDocument();
    }
    // Yen: no decimals anywhere.
    await expect(canvas.getByLabelText('Order total')).toHaveTextContent(format(ORDER.totalMinor));
    await expect(canvas.getByLabelText('Order total').textContent).not.toMatch(/\.\d/);
    // The locked fields are focusable and read-only, each with its reason.
    const number = canvas.getByRole('textbox', { name: 'Order number' });
    await expect(number).toHaveAttribute('readonly');
    await expect(number).toHaveAccessibleDescription(/Assigned when the order is created/);

    const first = ORDER.lines[0]!;
    const quantity = canvas.getByRole('textbox', { name: `Quantity of ${PRODUCT_NAME[first.id]}` });
    await editAndLeave(canvasElement, quantity, '0', args.onLeave);
    // "0" typed after the quantity: the total of the line and of the order follow the new value.
    const newQuantity = Number(`${first.quantity}0`);
    const newLine = lineTotalMinor(newQuantity, first.unitPriceMinor, first.discountPercent);
    await expect(canvas.getByLabelText(`Total of ${PRODUCT_NAME[first.id]}`)).toHaveTextContent(format(newLine));
    await expect(canvas.getByLabelText('Order total')).toHaveTextContent(format(ORDER.totalMinor - first.lineTotalMinor + newLine));
  },
};

// The same stories without their play, for the e2e (`-no-play`): a test starts from the state the Controls give.
export const UseCaseHrEmployeeNoPlay: StoryObj<HrArgs> = { ...UseCaseHrEmployee, name: 'Example: configured for an HR employee record (no play)', tags: ['use-case', 'vertical:hr', 'internal'], play: undefined };
export const UseCaseElearningCourseNoPlay: StoryObj<CourseArgs> = { ...UseCaseElearningCourse, name: 'Example: configured for an e-learning course (no play)', tags: ['use-case', 'vertical:e-learning', 'internal'], play: undefined };
export const UseCaseErpPurchaseOrderNoPlay: StoryObj<PurchaseOrderArgs> = { ...UseCaseErpPurchaseOrder, name: 'Example: configured for an ERP purchase order (no play)', tags: ['use-case', 'vertical:erp', 'internal'], play: undefined };
