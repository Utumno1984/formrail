import type { CSSProperties, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Avatar } from '../avatar/Avatar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage } from '../breadcrumb/Breadcrumb';
import { Button } from '../button/Button';
import { Card } from '../card/Card';
import { Checkbox } from '../checkbox/Checkbox';
import { Field, type FieldStateProps } from '../field/Field';
import { Input } from '../input/Input';
import { ListReportFilterBar } from '../list-report/ListReportFilterBar';
import { ListReportTable } from '../list-report/ListReportTable';
import type { ListReportColumn, ListReportFilter } from '../list-report/types';
import { useListReport } from '../list-report/use-list-report';
import { ObjectPage } from '../object-page/ObjectPage';
import { ObjectPageSection } from '../object-page/ObjectPageSection';
import { RadioGroup, RadioGroupItem } from '../radio-group/RadioGroup';
import { Select } from '../select/Select';
import { StatusBadge } from '../status-badge/StatusBadge';
import { Switch } from '../switch/Switch';
import { TruncatedText } from '../truncated-text/TruncatedText';

// Every interactive surface of the library in one place, to check the affordance by hand: pointer,
// hover, pressed (hold the mouse button), disabled and forced / locked. Hover and the pressed look
// cannot be simulated by a play function: they are covered by the e2e specs
// (`e2e/interaction-affordance*.spec.ts`), through the real computed styles.

interface Row {
  id: string;
  customer: string;
  status: 'pending' | 'approved';
}

const ROWS: Row[] = [
  { id: 'F-001', customer: 'Rossi Construction', status: 'pending' },
  { id: 'F-002', customer: 'Bianchi & Partners', status: 'approved' },
];
const COLUMNS: ListReportColumn<Row>[] = [
  { id: 'id', header: 'No.', accessor: (r) => r.id },
  { id: 'customer', header: 'Customer', accessor: (r) => r.customer },
];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (r) => r.status === 'approved' },
];

const GRID: CSSProperties = { display: 'grid', gap: 24, padding: 16, maxWidth: 720, fontFamily: 'var(--font-rop-sans)' };
const ROW_STYLE: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 };
const HEADING: CSSProperties = { margin: '0 0 8px', fontSize: 'var(--text-rop-label)', color: 'var(--color-rop-text-muted)' };

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-testid={id} aria-label={title}>
      <h3 style={HEADING}>{title}</h3>
      {children}
    </section>
  );
}

interface StoryArgs {
  disabled: boolean;
  state: 'default' | 'forced' | 'locked';
  onClick: () => void;
  onValueChange: (value: string) => void;
  onFilterChange: (filter: string) => void;
}

const meta: Meta<StoryArgs> = {
  title: 'Foundations/Interaction states',
  // Test fixture / state matrix, not a documented component: no Docs page.
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    disabled: { control: 'boolean', description: 'Disables every control (cursor not-allowed, no hover, no pressed look)' },
    state: {
      control: 'radio',
      options: ['default', 'forced', 'locked'],
      description: 'Field state of Select, Checkbox, Switch and RadioGroup: focusable but not interactive, no click affordance',
    },
    onClick: { control: false },
    onValueChange: { control: false },
    onFilterChange: { control: false },
  },
  args: { disabled: false, state: 'default', onClick: fn(), onValueChange: fn(), onFilterChange: fn() },
};

export default meta;
type Story = StoryObj<StoryArgs>;

function fieldState(disabled: boolean, state: StoryArgs['state']): FieldStateProps {
  if (disabled) return { state: 'disabled' };
  if (state === 'default') return { state: 'default' };
  return { state, stateReason: 'Decided by a business rule' };
}

function Surfaces({ disabled, state, onClick, onValueChange, onFilterChange }: StoryArgs) {
  const table = useListReport<Row>({
    rows: ROWS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
    onFilterChange,
  });
  const fs = fieldState(disabled, state);
  return (
    <div style={GRID}>
      <Group id="buttons" title="Button">
        <div style={ROW_STYLE}>
          <Button variant="primary" disabled={disabled} onClick={onClick}>
            Primary
          </Button>
          <Button variant="secondary" disabled={disabled} onClick={onClick}>
            Secondary
          </Button>
          <Button variant="ghost" disabled={disabled} onClick={onClick}>
            Ghost
          </Button>
          <Button variant="danger" disabled={disabled} onClick={onClick}>
            Danger
          </Button>
          <Button variant="secondary" asChild>
            <span
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled ? 'true' : undefined}
              onClick={() => (disabled ? undefined : onClick())}
              onKeyDown={(e) => (!disabled && (e.key === 'Enter' || e.key === ' ') ? onClick() : undefined)}
            >
              As child, no href
            </span>
          </Button>
        </div>
      </Group>

      <Group id="controls" title="Select, Checkbox, Switch, Radio">
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Field label="Select" {...fs}>
            <Select
              options={[
                { value: 'a', label: 'Option A' },
                { value: 'b', label: 'Option B' },
                { value: 'c', label: 'Option C (disabled)', disabled: true },
              ]}
              defaultValue="a"
              onValueChange={onValueChange}
            />
          </Field>
          <Field label="Checkbox" {...fs}>
            <Checkbox defaultChecked>Accept the terms</Checkbox>
          </Field>
          <Field label="Switch" {...fs}>
            <Switch>Notifications</Switch>
          </Field>
          <Field label="Radio" {...fs}>
            <RadioGroup defaultValue="one" aria-label="Radio">
              <RadioGroupItem value="one">First</RadioGroupItem>
              <RadioGroupItem value="two">Second</RadioGroupItem>
            </RadioGroup>
          </Field>
        </div>
      </Group>

      <Group id="list-report" title="Filter pills and sortable header">
        <ListReportFilterBar table={table} showSearch={false} />
        <div style={{ marginTop: 12 }}>
          <ListReportTable table={table} aria-label="Invoices" loadingRowCount={1} />
        </div>
      </Group>

      <Group id="anchor-bar" title="Anchor bar">
        <div style={{ height: 220, border: '1px solid var(--color-rop-border)' }}>
          <ObjectPage>
            <ObjectPageSection id="general" title="General">
              <p>General data.</p>
            </ObjectPageSection>
            <ObjectPageSection id="items" title="Items">
              <p>Line items.</p>
            </ObjectPageSection>
          </ObjectPage>
        </div>
      </Group>

      <Group id="breadcrumb" title="Breadcrumb">
        <Breadcrumb>
          <BreadcrumbItem>
            <BreadcrumbLink href="#home">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              {/* Like a router Link without href: no native pointer, the library must supply it. */}
              <span role="link" tabIndex={0} onClick={onClick} onKeyDown={(e) => (e.key === 'Enter' ? onClick() : undefined)}>
                Invoices (as child, no href)
              </span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbPage>F-001</BreadcrumbPage>
          </BreadcrumbItem>
        </Breadcrumb>
      </Group>

      <Group id="negatives" title="Not clickable: no pointer, hover or pressed look">
        <div style={ROW_STYLE}>
          <div style={{ width: 200 }}>
            <Input aria-label="Text input" defaultValue="Text cursor" />
          </div>
          <Card>Card</Card>
          <StatusBadge tone="success">Approved</StatusBadge>
          <Avatar name="Rossi Construction" />
          <div style={{ width: 120 }}>
            <TruncatedText>A long text that is cut by its container</TruncatedText>
          </div>
        </div>
      </Group>
    </div>
  );
}

const cursorOf = (el: HTMLElement): string => getComputedStyle(el).cursor;

/**
 * Controls: `disabled` (every control), `state` (forced / locked Fields). `onClick`, `onValueChange`
 * and `onFilterChange` show up in Actions. The play function reads the computed cursor of every
 * surface with the real CSS (pointer, not-allowed or text), then clicks a Button and a filter pill
 * and checks the Actions. Hover and pressed need a real pointer: see the e2e specs.
 */
export const Playground: Story = {
  tags: ['visual'],
  render: (args) => <Surfaces {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const blocked = args.disabled;
    const expected = blocked ? 'not-allowed' : 'pointer';

    for (const name of ['Primary', 'Secondary', 'Ghost', 'Danger']) {
      await expect(cursorOf(canvas.getByRole('button', { name }))).toBe(expected);
    }
    const asChild = canvas.getByText('As child, no href');
    await expect(cursorOf(asChild)).toBe(blocked ? 'not-allowed' : 'pointer');

    const interactive = args.disabled ? 'not-allowed' : args.state === 'default' ? 'pointer' : 'not-allowed';
    await expect(cursorOf(canvas.getByRole('combobox'))).toBe(interactive);
    await expect(cursorOf(canvas.getByRole('checkbox'))).toBe(interactive);
    await expect(cursorOf(canvas.getByRole('checkbox').closest('label') as HTMLElement)).toBe(interactive);
    await expect(cursorOf(canvas.getByRole('switch').closest('label') as HTMLElement)).toBe(interactive);
    for (const radio of canvas.getAllByRole('radio', { name: /First|Second/ })) {
      await expect(cursorOf(radio.closest('label') as HTMLElement)).toBe(interactive);
    }

    await expect(cursorOf(canvas.getByRole('radio', { name: 'Pending' }))).toBe('pointer');
    await expect(cursorOf(canvas.getByRole('button', { name: /Customer/ }))).toBe('pointer');
    await expect(cursorOf(canvas.getByRole('link', { name: 'General' }))).toBe('pointer');
    await expect(cursorOf(canvas.getByRole('link', { name: 'Home' }))).toBe('pointer');
    await expect(cursorOf(canvas.getByText('Invoices (as child, no href)'))).toBe('pointer');

    // Not clickable: text cursor on the input, nothing pointer-like on the rest.
    await expect(cursorOf(canvas.getByRole('textbox', { name: 'Text input' }))).toBe('text');
    const negatives = within(canvas.getByTestId('negatives'));
    for (const el of [negatives.getByText('Approved'), negatives.getByText('Card')]) {
      await expect(cursorOf(el)).not.toBe('pointer');
    }

    if (!blocked) {
      await userEvent.click(canvas.getByRole('button', { name: 'Secondary' }));
      await expect(args.onClick).toHaveBeenCalledTimes(1);
    }
    await userEvent.click(canvas.getByRole('radio', { name: 'Pending' }));
    await expect(args.onFilterChange).toHaveBeenCalledWith('pending');
    await expect(canvas.getByRole('radio', { name: 'Pending' })).toHaveAttribute('aria-checked', 'true');
  },
};
