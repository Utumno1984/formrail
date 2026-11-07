// Internal fixture for the icon/text vertical alignment measurements (e2e/icon-text-alignment.spec.ts,
// ticket #217): every component that puts an icon (or a control drawn like one) next to a line of
// text, rendered once, each case wrapped in a `data-align-case` element. The spec reads the real
// geometry of the icon node and of the text node and compares their vertical centres.
// Not exported from the package.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, type ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Checkbox } from '../checkbox/Checkbox';
import { Combobox } from '../combobox/Combobox';
import { Field } from '../field/Field';
import { FieldMessage } from '../field-message/FieldMessage';
import { Icon } from '../icon/Icon';
import { ListReportTable } from '../list-report/ListReportTable';
import { useListReport } from '../list-report/use-list-report';
import { MessageStrip } from '../message-strip/MessageStrip';
import { ObjectPage } from '../object-page/ObjectPage';
import { ObjectPageFooter } from '../object-page/ObjectPageFooter';
import { RadioGroup, RadioGroupItem } from '../radio-group/RadioGroup';
import { Select } from '../select/Select';
import { StatusBadge, type StatusBadgeTone } from '../status-badge/StatusBadge';
import { Switch } from '../switch/Switch';
import { ToastProvider } from '../toast/ToastProvider';
import { useToast } from '../toast/use-toast';
import { Text } from '../typography/Text';
import { internalIcons } from './icons';

const meta = {
  title: 'Internal/IconTextAlignment',
  // Test fixture / state matrix, not a documented component: no Docs page.
  tags: ['!autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One measured case. `icon` / `text` are CSS selectors resolved inside the case: the icon is the
 * SVG (or the native control drawn as the icon), the text is the element whose first text node is
 * the line the icon sits next to.
 */
function Case({ name, icon, text, children }: { name: string; icon: string; text: string; children: ReactNode }) {
  return (
    <div data-align-case={name} data-align-icon={icon} data-align-text={text} style={{ padding: 4 }}>
      {children}
    </div>
  );
}

const SORT_ROWS = [{ id: 'a', customer: 'Rossi Construction' }];

function SortHeader() {
  const table = useListReport({
    rows: SORT_ROWS,
    columns: [{ id: 'customer', header: 'Customer', accessor: (r) => r.customer }],
    getRowId: (r) => r.id,
    defaultSort: { columnId: 'customer', direction: 'desc' },
  });
  return <ListReportTable table={table} aria-label="Invoices" />;
}

const BADGES: Array<[StatusBadgeTone, keyof typeof internalIcons, string]> = [
  ['info', 'info', 'Submitted'],
  ['success', 'success', 'Approved'],
  ['warning', 'warning', 'Overdue'],
  ['error', 'error', 'Rejected'],
];

/**
 * Every icon + text pair of the core package, one per row. The play function checks that each
 * case found both its icon and its text node (a renamed class or a removed icon would otherwise
 * make the e2e measure nothing).
 */
export const AllPairs: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'start', maxWidth: 480 }}>
      {BADGES.map(([tone, icon, label]) => (
        <Case key={tone} name={`status-badge-${tone}`} icon="svg" text="[data-rop-badge-icon] + span">
          <StatusBadge tone={tone} icon={internalIcons[icon]}>
            {label}
          </StatusBadge>
        </Case>
      ))}
      <Case name="checkbox" icon="input" text="label > span:last-child">
        <Checkbox defaultChecked>Send a copy by email</Checkbox>
      </Case>
      <Case name="switch" icon="input" text="label > span:last-child">
        <Switch defaultChecked>Notifications</Switch>
      </Case>
      <Case name="radio" icon="input" text="label > span:last-child">
        <RadioGroup aria-label="Delivery" defaultValue="standard">
          <RadioGroupItem value="standard">Standard delivery</RadioGroupItem>
        </RadioGroup>
      </Case>
      <Case name="field-message-error" icon="svg" text=":scope > div > span:last-child">
        <FieldMessage id="align-fm" tone="error">
          Enter a valid amount.
        </FieldMessage>
      </Case>
      <Case name="message-strip" icon="svg" text=":scope > div > div > div">
        <MessageStrip tone="success" live={false}>
          The invoice was approved.
        </MessageStrip>
      </Case>
      <Case name="list-report-sort-arrow" icon="th svg" text="th button > *:first-child">
        <SortHeader />
      </Case>
      <Case name="object-page-footer" icon="[data-object-page-footer-message] svg" text="[data-object-page-footer-message] > span:last-child">
        <div style={{ height: 120, display: 'flex', flexDirection: 'column' }}>
          <ObjectPage>
            <ObjectPageFooter visible message="3 invalid fields" messageTone="error">
              <Button>Save</Button>
            </ObjectPageFooter>
          </ObjectPage>
        </div>
      </Case>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <Case key={size} name={`button-${size}`} icon="svg" text="button > span">
          <Button size={size} leadingIcon={internalIcons.check}>
            Approve
          </Button>
        </Case>
      ))}
      <Case name="text-caption-icon" icon="svg" text="p">
        <Text variant="caption">
          <Icon size="sm">{internalIcons.info}</Icon> Paid on delivery
        </Text>
      </Case>
      <Case name="text-body-icon" icon="svg" text="p">
        <Text>
          <Icon size="sm">{internalIcons.info}</Icon> Paid on delivery
        </Text>
      </Case>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const cases = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-align-case]'));
    await expect(cases.length).toBeGreaterThan(10);
    for (const c of cases) {
      const icon = c.querySelector(c.dataset.alignIcon ?? '');
      const text = c.querySelector(c.dataset.alignText ?? '');
      await expect(icon, `${c.dataset.alignCase}: icon`).not.toBeNull();
      await expect(text?.textContent?.trim(), `${c.dataset.alignCase}: text`).toBeTruthy();
    }
    await expect(within(canvasElement).getByRole('checkbox', { name: 'Send a copy by email' })).toBeChecked();
  },
};

/**
 * Marks a node rendered in a portal (outside the story root) as a measured case: the e2e reads
 * `[data-align-case]` from the whole document.
 */
function markCase(node: Element, name: string, icon: string, text: string) {
  const el = node as HTMLElement;
  el.dataset.alignCase = name;
  el.dataset.alignIcon = icon;
  el.dataset.alignText = text;
}

function ShowToast() {
  const toast = useToast();
  useEffect(() => {
    toast.show({ id: 'align', tone: 'success', title: 'Invoice approved', description: 'Sent to accounting.', duration: null });
  }, [toast]);
  return null;
}

/** The toast icon next to the title (first line). The toast lives in the provider's portal. */
export const ToastPair: Story = {
  render: () => (
    <ToastProvider style={{ top: 16, bottom: 'auto' }}>
      {/* The provider only renders into a portal, and the story helper requires some root output. */}
      <div style={{ height: 120 }} />
      <ShowToast />
    </ToastProvider>
  ),
  play: async () => {
    const toast = await waitFor(() => {
      const el = document.querySelector('[data-state="open"]');
      if (!el) throw new Error('toast not shown');
      return el;
    });
    markCase(toast, 'toast', 'svg', 'strong');
  },
};

const OPTIONS = [
  { value: 'it', label: 'Italy' },
  { value: 'fr', label: 'France' },
  { value: 'es', label: 'Spain' },
];
const SELECTED_OPTION = '[role="option"][aria-selected="true"]';

/** The selection check of the selected option of an open Select. */
export const SelectOptionPair: Story = {
  render: () => (
    <div style={{ width: 240 }}>
      <Field label="Country">
        <Select options={OPTIONS} defaultValue="fr" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Country' }));
    const option = await within(document.body).findByRole('option', { name: 'France' });
    markCase(option.parentElement!, 'select-option', `${SELECTED_OPTION} svg`, SELECTED_OPTION);
  },
};

/** The selection check of the selected option of an open Combobox. */
export const ComboboxOptionPair: Story = {
  render: () => (
    <div style={{ width: 240 }}>
      <Field label="Country">
        <Combobox options={OPTIONS} defaultValue="fr" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Country' }));
    const option = await within(document.body).findByRole('option', { name: 'France' });
    markCase(option.parentElement!, 'combobox-option', `${SELECTED_OPTION} svg`, SELECTED_OPTION);
  },
};
