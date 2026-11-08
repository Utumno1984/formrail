import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Calendar } from '../calendar/Calendar';
import { Checkbox } from '../checkbox/Checkbox';
import { Combobox } from '../combobox/Combobox';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { MultiSelect } from '../multi-select/MultiSelect';
import { RadioGroup, RadioGroupItem } from '../radio-group/RadioGroup';
import { Select } from '../select/Select';
import { Switch } from '../switch/Switch';

// The forced / locked and invalid looks of the form controls (#223). jsdom computes no Tailwind CSS:
// the computed styles are asserted by `e2e/control-states.spec.ts`; here the class contract (the
// consumer's className wins over the new classes through tailwind-merge) and the Calendar branches
// chosen in the render.

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const classes = (el: Element) => el.className.toString().split(/\s+/);
const OPTIONS = [{ value: 'it', label: 'Italy' }];

describe('className wins over the forced / locked and invalid classes (real merge)', () => {
  it('Checkbox: a consumer border style and fill replace the read-only and invalid ones', () => {
    render(
      <Checkbox
        aria-label="x"
        className="aria-readonly:border-solid not-forced-colors:aria-readonly:bg-rop-surface not-forced-colors:not-aria-readonly:aria-invalid:checked:bg-rop-warning"
      />,
    );
    const cls = classes(screen.getByRole('checkbox'));
    expect(cls).toContain('aria-readonly:border-solid');
    expect(cls).not.toContain('aria-readonly:border-dashed');
    expect(cls).toContain('not-forced-colors:aria-readonly:bg-rop-surface');
    expect(cls).not.toContain('not-forced-colors:aria-readonly:bg-rop-readonly-surface');
    expect(cls).toContain('not-forced-colors:not-aria-readonly:aria-invalid:checked:bg-rop-warning');
    expect(cls).not.toContain('not-forced-colors:not-aria-readonly:aria-invalid:checked:bg-rop-error');
  });

  it('Switch: a consumer border style and track replace the read-only and invalid ones', () => {
    render(
      <Switch
        aria-label="x"
        className="aria-readonly:border-solid not-forced-colors:not-aria-readonly:aria-invalid:checked:bg-rop-warning"
      />,
    );
    const cls = classes(screen.getByRole('switch'));
    expect(cls).toContain('aria-readonly:border-solid');
    expect(cls).not.toContain('aria-readonly:border-dashed');
    expect(cls).not.toContain('not-forced-colors:not-aria-readonly:aria-invalid:checked:bg-rop-error');
  });

  it('RadioGroupItem: a consumer border style replaces the read-only one', () => {
    render(
      <RadioGroup aria-label="x">
        <RadioGroupItem value="a" className="group-aria-readonly/rg:border-solid">
          A
        </RadioGroupItem>
      </RadioGroup>,
    );
    const cls = classes(screen.getByRole('radio'));
    expect(cls).toContain('group-aria-readonly/rg:border-solid');
    expect(cls).not.toContain('group-aria-readonly/rg:border-dashed');
  });

  it('Input and Combobox: a consumer border style replaces the read-only one', () => {
    render(
      <>
        <Input aria-label="input" className="read-only:not-disabled:border-solid" />
        <Combobox aria-label="combobox" options={OPTIONS} className="read-only:not-disabled:border-solid" />
      </>,
    );
    for (const el of [screen.getByRole('textbox', { name: 'input' }), screen.getByRole('combobox', { name: 'combobox' })]) {
      const cls = classes(el);
      expect(cls).toContain('read-only:not-disabled:border-solid');
      expect(cls).not.toContain('read-only:not-disabled:border-dashed');
    }
  });

  it('MultiSelect: a consumer border style and surface on the box replace the read-only and invalid ones', () => {
    const { container } = render(
      <MultiSelect
        aria-label="multi"
        options={OPTIONS}
        className="data-[readonly]:not-data-[disabled]:border-solid data-[readonly]:bg-rop-surface data-[invalid]:border-rop-warning"
      />,
    );
    const cls = classes(container.querySelector('[data-rop-multi-select]')!);
    expect(cls).toContain('data-[readonly]:not-data-[disabled]:border-solid');
    expect(cls).not.toContain('data-[readonly]:not-data-[disabled]:border-dashed');
    expect(cls).not.toContain('data-[readonly]:bg-rop-readonly-surface');
    expect(cls).not.toContain('data-[invalid]:border-rop-error');
  });

  it('MultiSelect: the box carries the Field state of its input (forced / locked, invalid, disabled)', () => {
    const { container } = render(
      <>
        <Field label="locked" state="locked" stateReason="Locked." error="Required.">
          <MultiSelect options={OPTIONS} />
        </Field>
        <Field label="disabled" state="disabled">
          <MultiSelect options={OPTIONS} />
        </Field>
        <MultiSelect aria-label="plain" options={OPTIONS} />
      </>,
    );
    const [locked, disabled, plain] = Array.from(container.querySelectorAll('[data-rop-multi-select]'));
    expect(locked).toHaveAttribute('data-readonly');
    expect(locked).toHaveAttribute('data-invalid');
    expect(locked).not.toHaveAttribute('data-disabled');
    expect(disabled).toHaveAttribute('data-disabled');
    for (const name of ['data-readonly', 'data-invalid', 'data-disabled']) expect(plain).not.toHaveAttribute(name);
  });

  it('Select: a consumer border style and surface replace the read-only ones', () => {
    render(<Select aria-label="select" options={OPTIONS} className="aria-readonly:border-solid aria-readonly:bg-rop-surface" />);
    const cls = classes(screen.getByRole('combobox', { name: 'select' }));
    expect(cls).toContain('aria-readonly:border-solid');
    expect(cls).not.toContain('aria-readonly:border-dashed');
    expect(cls).not.toContain('aria-readonly:bg-rop-readonly-surface');
  });

  it('Calendar: a consumer border style replaces the dashed read-only frame', () => {
    const { container } = render(<Calendar aria-label="Due" readOnly today="2026-03-10" className="border-solid" />);
    const cls = classes(container.firstElementChild!);
    expect(cls).toContain('border-solid');
    expect(cls).not.toContain('border-dashed');
  });
});

describe('Calendar: the selected day per state', () => {
  const BASE = { locale: 'en-US', today: '2026-03-10', defaultValue: '2026-03-17' } as const;
  const selectedDay = () => screen.getByRole('gridcell', { name: 'Tuesday, March 17, 2026' }).firstElementChild!;
  const today = () => screen.getByRole('gridcell', { name: 'Tuesday, March 10, 2026' }).firstElementChild!;

  it('default: primary fill', () => {
    render(<Calendar {...BASE} aria-label="Due" />);
    expect(classes(selectedDay())).toContain('bg-rop-primary');
    expect(classes(today())).toContain('border-rop-primary');
  });

  it('invalid (in a Field with an error): error fill, never primary', () => {
    render(
      <Field label="Due" error="Pick a working day.">
        <Calendar {...BASE} />
      </Field>,
    );
    const cls = classes(selectedDay());
    expect(cls).toContain('not-forced-colors:bg-rop-error');
    expect(cls).not.toContain('bg-rop-primary');
  });

  it.each([
    ['readOnly outside a Field', () => <Calendar {...BASE} aria-label="Due" readOnly />],
    [
      'forced',
      () => (
        <Field label="Due" state="forced" stateReason="Set by the contract.">
          <Calendar {...BASE} />
        </Field>
      ),
    ],
    [
      'locked + invalid',
      () => (
        <Field label="Due" state="locked" stateReason="Locked." error="Pick a working day.">
          <Calendar {...BASE} />
        </Field>
      ),
    ],
  ])('%s: an outlined neutral day, a dashed frame, no primary or error fill', (_, ui) => {
    const { container } = render(ui());
    const cls = classes(selectedDay());
    expect(cls).toContain('not-forced-colors:border-rop-readonly-indicator');
    expect(cls).toContain('text-rop-text');
    expect(cls.some((c) => /bg-rop-(primary|error)/.test(c))).toBe(false);
    expect(classes(today())).not.toContain('border-rop-primary');
    expect(classes(today())).not.toContain('text-rop-primary');
    expect(classes(container.querySelector('[role="group"]')!)).toContain('border-dashed');
  });

  it('disabled: the default primary fill (the 0.5 opacity is on the frame), no dashed frame', () => {
    const { container } = render(<Calendar {...BASE} aria-label="Due" disabled readOnly />);
    expect(classes(selectedDay())).toContain('bg-rop-primary');
    const root = classes(container.firstElementChild!);
    expect(root).toContain('opacity-50');
    expect(root).not.toContain('border-dashed');
  });
});
