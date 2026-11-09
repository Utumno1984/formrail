import { useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { Calendar } from '../calendar/Calendar';
import { Checkbox, type CheckedState } from '../checkbox/Checkbox';
import { Combobox } from '../combobox/Combobox';
import { Input } from '../input/Input';
import { MultiSelect } from '../multi-select/MultiSelect';
import { NumberInput } from '../number-input/NumberInput';
import { RadioGroup, RadioGroupItem } from '../radio-group/RadioGroup';
import { Select } from '../select/Select';
import { Switch } from '../switch/Switch';
import { Textarea } from '../textarea/Textarea';
import { Field, type FieldStateProps } from './Field';

interface MatrixArgs {
  withMessages: boolean;
  onChange: (value: unknown) => void;
}

const meta: Meta<MatrixArgs> = {
  title: 'Internal/ControlStates',
  // Test fixture / state matrix, not a documented component: no Docs page; `internal`: hidden from the public sidebar (#296).
  tags: ['!autodocs', 'internal'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    withMessages: {
      control: 'boolean',
      description:
        'Show the Field messages: the error of the invalid columns and the reason of the forced / locked ones. ' +
        'Off: the invalid controls carry `aria-invalid` on their own and the blocked Fields give no reason text ' +
        '(the Calendar takes `invalid` only from its Field\'s error, so its error text stays).',
    },
    onChange: { control: false, description: 'Every user change of a control of the default column (Actions panel).' },
  },
  args: { withMessages: false, onChange: fn() },
};

export default meta;
type Story = StoryObj<MatrixArgs>;

// Inline styles: the stories are not scanned by Tailwind. The cells wrap (one column on a phone)
// instead of overflowing.
const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16,
  padding: 16,
  boxSizing: 'border-box',
};
// The Calendar is ~306px wide (7 × 40px columns + its frame): its cells need the room.
const CALENDAR_GRID: CSSProperties = { ...GRID, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' };
const CELL: CSSProperties = { minWidth: 0 };

const STATES = ['default', 'invalid', 'disabled', 'forced', 'locked', 'locked-invalid'] as const;
type State = (typeof STATES)[number];
const KINDS = [
  'checkbox-unchecked',
  'checkbox-checked',
  'checkbox-indeterminate',
  'switch-off',
  'switch-on',
  'radio',
  'input',
  'textarea',
  'select',
  'combobox',
  'number',
  'multi-select',
] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABEL: Record<Kind, string> = {
  'checkbox-unchecked': 'Checkbox, unchecked',
  'checkbox-checked': 'Checkbox, checked',
  'checkbox-indeterminate': 'Checkbox, indeterminate',
  'switch-off': 'Switch, off',
  'switch-on': 'Switch, on',
  radio: 'RadioGroup',
  input: 'Input',
  textarea: 'Textarea',
  select: 'Select',
  combobox: 'Combobox',
  number: 'NumberInput',
  'multi-select': 'MultiSelect',
};
const STATE_LABEL: Record<State, string> = {
  default: 'default',
  invalid: 'invalid',
  disabled: 'disabled',
  forced: 'forced',
  locked: 'locked',
  'locked-invalid': 'locked + invalid',
};
const BLOCKED: readonly State[] = ['forced', 'locked', 'locked-invalid'];
const INVALID: readonly State[] = ['invalid', 'locked-invalid'];
const ERROR = 'Required.';
const REASON: Record<'forced' | 'locked', string> = {
  forced: 'Decided by the framework agreement.',
  locked: 'Locked after approval.',
};
const OPTIONS = [
  { value: 'it', label: 'Italy' },
  { value: 'fr', label: 'France' },
];
const TODAY = '2026-03-10';

/** The Field props of a column. Without messages the reason is empty (no text, no description). */
function fieldProps(state: State, withMessages: boolean): FieldStateProps & { error?: string } {
  const error = withMessages && INVALID.includes(state) ? ERROR : undefined;
  if (state === 'disabled') return { state: 'disabled' };
  if (state === 'forced') return { state: 'forced', stateReason: withMessages ? REASON.forced : '' };
  if (state === 'locked' || state === 'locked-invalid') return { state: 'locked', stateReason: withMessages ? REASON.locked : '', error };
  return { error };
}

function CheckboxCell({ initial, own, onChange }: { initial: CheckedState; own: object; onChange: (v: unknown) => void }) {
  const [value, setValue] = useState<CheckedState>(initial);
  return (
    <Checkbox
      {...own}
      checked={value}
      onCheckedChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    >
      Option
    </Checkbox>
  );
}

function Control({ kind, own, onChange }: { kind: Kind; own: object; onChange: (v: unknown) => void }) {
  switch (kind) {
    case 'checkbox-unchecked':
      return <CheckboxCell initial={false} own={own} onChange={onChange} />;
    case 'checkbox-checked':
      return <CheckboxCell initial={true} own={own} onChange={onChange} />;
    case 'checkbox-indeterminate':
      return <CheckboxCell initial="indeterminate" own={own} onChange={onChange} />;
    case 'switch-off':
    case 'switch-on':
      return (
        <Switch {...own} defaultChecked={kind === 'switch-on'} onCheckedChange={onChange}>
          Option
        </Switch>
      );
    case 'radio':
      return (
        <RadioGroup {...own} defaultValue="yearly" onValueChange={onChange}>
          <RadioGroupItem value="monthly">Monthly</RadioGroupItem>
          <RadioGroupItem value="yearly">Yearly</RadioGroupItem>
        </RadioGroup>
      );
    case 'input':
      return <Input {...own} defaultValue="ACME Ltd" onChange={(event) => onChange(event.currentTarget.value)} />;
    case 'textarea':
      return <Textarea {...own} defaultValue="ACME Ltd" onChange={(event) => onChange(event.currentTarget.value)} />;
    case 'select':
      return <Select {...own} options={OPTIONS} defaultValue="it" onValueChange={onChange} />;
    case 'combobox':
      return <Combobox {...own} options={OPTIONS} defaultValue="fr" onValueChange={onChange} />;
    case 'number':
      return <NumberInput {...own} defaultValue={12} min={0} max={100} onValueChange={onChange} />;
    case 'multi-select':
      return <MultiSelect {...own} options={OPTIONS} defaultValue={['fr']} onValueChange={onChange} />;
  }
}

function Cell({ kind, state, withMessages, onChange }: { kind: Kind; state: State; withMessages: boolean; onChange: (v: unknown) => void }) {
  // Without messages, "invalid" is the control's own `aria-invalid` (the Field has no error).
  const own = !withMessages && INVALID.includes(state) ? { 'aria-invalid': true } : {};
  return (
    <div style={CELL} data-testid={`cell-${kind}-${state}`}>
      <Field label={`${KIND_LABEL[kind]} / ${STATE_LABEL[state]}`} {...fieldProps(state, withMessages)}>
        <Control kind={kind} own={own} onChange={onChange} />
      </Field>
    </div>
  );
}

/** The element carrying the Field's ARIA (the group for a RadioGroup) and the one drawing the box. */
function controlsOf(cell: HTMLElement, kind: Kind): { aria: HTMLElement; box: HTMLElement } {
  const c = within(cell);
  if (kind === 'radio') return { aria: c.getByRole('radiogroup'), box: c.getByRole('radio', { name: 'Yearly' }) };
  const role = kind.startsWith('checkbox') ? 'checkbox' : kind.startsWith('switch') ? 'switch' : kind === 'input' || kind === 'textarea' ? 'textbox' : kind === 'number' ? 'spinbutton' : 'combobox';
  const el = c.getByRole(role);
  if (kind === 'multi-select') return { aria: el, box: cell.querySelector<HTMLElement>('[data-rop-multi-select]')! };
  return { aria: el, box: el };
}

/**
 * Every form control in every state, side by side (#223): rows Checkbox (unchecked / checked /
 * indeterminate), Switch (off / on), RadioGroup, Input, Select, Combobox, NumberInput, MultiSelect; columns default, invalid,
 * disabled, forced, locked, locked + invalid. Forced and locked share one look (dashed border,
 * read-only surface, neutral indicator, full opacity); invalid owns the colour (error border and
 * fill); disabled is the default look at 0.5 opacity. Photographed on mobile, tablet and desktop;
 * `e2e/control-states.spec.ts` asserts the computed styles. The default column is live (its changes
 * go to Actions); the play function only reads the states, it clicks nothing.
 */
export const Matrix: Story = {
  tags: ['visual'],
  render: ({ withMessages, onChange }) => (
    <div style={GRID}>
      {KINDS.flatMap((kind) =>
        STATES.map((state) => <Cell key={`${kind}-${state}`} kind={kind} state={state} withMessages={withMessages} onChange={onChange} />),
      )}
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    for (const kind of KINDS) {
      for (const state of STATES) {
        const { aria, box } = controlsOf(canvas.getByTestId(`cell-${kind}-${state}`), kind);
        const blocked = BLOCKED.includes(state);
        if (INVALID.includes(state)) await expect(aria).toHaveAttribute('aria-invalid', 'true');
        else await expect(aria).not.toHaveAttribute('aria-invalid');
        if (blocked) await expect(aria).toHaveAttribute('aria-readonly', 'true');
        else await expect(aria).not.toHaveAttribute('aria-readonly');
        // The MultiSelect's box is a wrapper: `disabled` is on its text input (the ARIA element).
        if (state === 'disabled') await expect(kind === 'multi-select' ? aria : box).toBeDisabled();
        else await expect(kind === 'multi-select' ? aria : box).toBeEnabled();
        // The forced / locked look is a dashed border; every other state keeps the solid one.
        await expect(getComputedStyle(box).borderTopStyle).toBe(blocked ? 'dashed' : 'solid');
        // The MultiSelect's description ends with the hidden list of its selected labels.
        const selected = kind === 'multi-select' ? ' France' : '';
        if (args.withMessages && state === 'forced') await expect(aria).toHaveAccessibleDescription(`${REASON.forced}${selected}`);
        if (args.withMessages && state === 'locked-invalid')
          await expect(aria).toHaveAccessibleDescription(`${REASON.locked} ${ERROR}${selected}`);
      }
    }
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

/**
 * The Calendar in the same six states, plus invalid with nothing selected (only the frame turns red).
 * The selected day is filled with primary (default, disabled), with error (invalid), and outlined in
 * neutral colours on a dashed frame when forced / locked (also with an error: red dashed frame).
 */
export const CalendarMatrix: Story = {
  tags: ['visual'],
  render: ({ withMessages, onChange }) => (
    <div style={CALENDAR_GRID}>
      {[...STATES, 'invalid-empty' as const].map((state) => {
        const column = state === 'invalid-empty' ? 'invalid' : state;
        // The Calendar is invalid only through its Field's error: always given to the invalid columns.
        const props = { ...fieldProps(column, withMessages), ...(INVALID.includes(column) ? { error: ERROR } : {}) };
        return (
          <div key={state} style={CELL} data-testid={`cell-calendar-${state}`}>
            <Field label={`Calendar / ${state === 'invalid-empty' ? 'invalid, nothing selected' : STATE_LABEL[state]}`} {...props}>
              <Calendar
                locale="en-US"
                today={TODAY}
                defaultValue={state === 'invalid-empty' ? undefined : '2026-03-17'}
                onValueChange={onChange}
              />
            </Field>
          </div>
        );
      })}
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    for (const state of [...STATES, 'invalid-empty'] as const) {
      const cell = within(canvas.getByTestId(`cell-calendar-${state}`));
      const root = cell.getByRole('group');
      const grid = cell.getByRole('grid');
      const blocked = (BLOCKED as readonly string[]).includes(state);
      if (blocked) await expect(grid).toHaveAttribute('aria-readonly', 'true');
      else await expect(grid).not.toHaveAttribute('aria-readonly');
      await expect(root.hasAttribute('data-invalid')).toBe(state === 'invalid' || state === 'invalid-empty' || state === 'locked-invalid');
      await expect(getComputedStyle(root).borderTopStyle).toBe(blocked ? 'dashed' : 'solid');
      const selected = cell.queryByRole('gridcell', { selected: true });
      if (state === 'invalid-empty') await expect(selected).toBeNull();
      else await expect(selected).toHaveAccessibleName('Tuesday, March 17, 2026');
    }
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};
