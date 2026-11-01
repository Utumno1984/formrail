import { render, screen } from '@testing-library/react';
import { Combobox } from '../combobox/Combobox';
import { Input } from '../input/Input';
import { Select } from '../select/Select';
import { Field } from './Field';
import { useFieldControl } from './useFieldControl';

const OPTIONS = [{ value: 'it', label: 'Italia' }];

function Probe() {
  const control = useFieldControl();
  return <output data-testid="probe">{JSON.stringify({ keys: Object.keys(control), name: control['data-rop-name'] ?? null })}</output>;
}

describe('Field name', () => {
  it('puts data-rop-name on Input, Select and Combobox', () => {
    render(
      <>
        <Field label="A" name="a">
          <Input />
        </Field>
        <Field label="B" name="b">
          <Select options={OPTIONS} />
        </Field>
        <Field label="C" name="c">
          <Combobox options={OPTIONS} />
        </Field>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'A' })).toHaveAttribute('data-rop-name', 'a');
    expect(screen.getByRole('combobox', { name: 'B' })).toHaveAttribute('data-rop-name', 'b');
    expect(screen.getByRole('combobox', { name: 'C' })).toHaveAttribute('data-rop-name', 'c');
  });

  it('Input and Combobox also emit a native name; Select never does', () => {
    render(
      <>
        <Field label="A" name="a">
          <Input />
        </Field>
        <Field label="B" name="b">
          <Select options={OPTIONS} />
        </Field>
        <Field label="C" name="c">
          <Combobox options={OPTIONS} />
        </Field>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'A' })).toHaveAttribute('name', 'a');
    expect(screen.getByRole('combobox', { name: 'B' })).not.toHaveAttribute('name');
    expect(screen.getByRole('combobox', { name: 'C' })).toHaveAttribute('name', 'c');
  });

  it("the consumer's own native name wins over the Field's", () => {
    render(
      <>
        <Field label="A" name="a">
          <Input name="mine" />
        </Field>
        <Field label="C" name="c">
          <Combobox options={OPTIONS} name="mine-c" />
        </Field>
      </>,
    );
    const a = screen.getByRole('textbox', { name: 'A' });
    expect(a).toHaveAttribute('name', 'mine');
    expect(a).toHaveAttribute('data-rop-name', 'a');
    expect(screen.getByRole('combobox', { name: 'C' })).toHaveAttribute('name', 'mine-c');
  });

  it('emits no attribute at all when name is absent or empty', () => {
    render(
      <>
        <Field label="A">
          <Input />
        </Field>
        <Field label="B" name="">
          <Select options={OPTIONS} />
        </Field>
        <Field label="C">
          <Probe />
        </Field>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'A' })).not.toHaveAttribute('data-rop-name');
    expect(screen.getByRole('textbox', { name: 'A' })).not.toHaveAttribute('name');
    expect(screen.getByRole('combobox', { name: 'B' })).not.toHaveAttribute('data-rop-name');
    const probe = JSON.parse(screen.getByTestId('probe').textContent!);
    expect(probe.keys).not.toContain('data-rop-name');
    expect(probe.name).toBeNull();
  });

  it('exposes data-rop-name as an enumerable key to the render-prop', () => {
    render(
      <Field label="A" name="a">
        {(control) => <input {...control} />}
      </Field>,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('data-rop-name', 'a');
  });

  it('does not leak name onto the Field container (no leak)', () => {
    const { container } = render(
      <Field label="A" name="a" data-testid="root">
        <Input />
      </Field>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute('name');
    expect(root).not.toHaveAttribute('data-rop-name');
    expect(root.querySelectorAll('[name]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-rop-name]')).toHaveLength(1);
  });
});
