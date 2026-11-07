// Internal fixture for `useCombobox`: bare `<input>` + `<ul>`, no style. Not exported from the
// package and never to be re-exported from it.
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { useCombobox } from '../combobox/use-combobox';

interface City {
  id: string;
  label: string;
  disabled?: boolean;
}

const CITIES: City[] = [
  { id: 'mi', label: 'Milano' },
  { id: 'mo', label: 'Modena' },
  { id: 'mn', label: 'Mantova', disabled: true },
  { id: 'sp', label: 'São Paulo' },
  { id: 'to', label: 'Torino' },
];
const OUTSIDE: City = { id: 'rm', label: 'Roma (set from outside)' };

interface DemoArgs {
  clearOnEmpty: boolean;
  onSelectedItemChange: (item: City | null) => void;
  onInputValueChange: (value: string) => void;
}

function ComboboxDemo({ clearOnEmpty, onSelectedItemChange, onInputValueChange }: DemoArgs) {
  const [selected, setSelected] = useState<City | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const combobox = useCombobox<City>({
    items: CITIES,
    itemToString: (city) => city.label,
    itemToKey: (city) => city.id,
    isItemDisabled: (city) => !!city.disabled,
    selectedItem: selected,
    clearOnEmpty,
    onSelectedItemChange: (item) => {
      setSelected(item);
      setLog((entries) => [...entries, `onSelectedItemChange(${item ? item.label : 'null'})`]);
      onSelectedItemChange(item);
    },
    onInputValueChange,
  });

  return (
    <div style={{ fontFamily: 'sans-serif', display: 'grid', gap: 8, justifyItems: 'start' }}>
      <label>
        City <input {...combobox.getInputProps()} />
      </label>
      <ul {...combobox.getListboxProps({ 'aria-label': 'Cities' })} hidden={!combobox.isOpen}>
        {combobox.filteredItems.map((city, index) => (
          <li
            key={city.id}
            {...combobox.getOptionProps(city, index)}
            style={{ background: index === combobox.activeIndex ? '#dbeafe' : undefined }}
          >
            {city.label}
          </li>
        ))}
        {combobox.filteredItems.length === 0 && (
          <li role="option" aria-disabled="true" aria-selected="false">
            No results
          </li>
        )}
      </ul>
      <button type="button" onClick={() => setSelected(OUTSIDE)}>
        Set from outside
      </button>
      <button type="button">Other control</button>
      <dl data-testid="debug" style={{ margin: 0 }}>
        <dt>selectedItem</dt>
        <dd data-testid="selected">{combobox.selectedItem ? combobox.selectedItem.label : 'none'}</dd>
        <dt>isOpen</dt>
        <dd data-testid="is-open">{String(combobox.isOpen)}</dd>
        <dt>activeIndex</dt>
        <dd data-testid="active-index">{combobox.activeIndex}</dd>
      </dl>
      <ol data-testid="log" aria-label="Call log">
        {log.map((entry, i) => (
          <li key={i}>{entry}</li>
        ))}
      </ol>
    </div>
  );
}

const meta: Meta<DemoArgs> = {
  title: 'Internal/UseComboboxFixture',
  // Test fixture / state matrix, not a documented component: no Docs page; `internal`: hidden from the public sidebar (#296).
  tags: ['!autodocs', 'internal'],
  parameters: { layout: 'padded' },
  argTypes: {
    clearOnEmpty: { control: 'boolean' },
    onSelectedItemChange: { control: false },
    onInputValueChange: { control: false },
  },
  args: { clearOnEmpty: false, onSelectedItemChange: fn(), onInputValueChange: fn() },
  render: (args) => <ComboboxDemo {...args} />,
};

export default meta;
type Story = StoryObj<DemoArgs>;

/** Type, move with the arrows, select with Enter; the focus never leaves the input. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', { name: 'City' });
    await userEvent.click(input);
    await userEvent.keyboard('mil');
    await waitFor(() => expect(canvas.getAllByRole('option')).toHaveLength(1));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(input).toHaveValue('Milano'));
    await expect(input).toHaveFocus();
    await expect(args.onSelectedItemChange).toHaveBeenCalledTimes(1);
    await expect(args.onSelectedItemChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'mi' }));
  },
};

/** No play function: the e2e tests drive it from a clean start with the real keyboard and mouse. */
export const Manual: Story = {};

/** A selection outside the results stays; the system-set value is not an echo. */
export const SelectionOutsideResults: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', { name: 'City' });
    await userEvent.click(input);
    await userEvent.keyboard('mil{Enter}');
    await userEvent.keyboard('xyz');
    await waitFor(() =>
      expect(canvas.getAllByRole('option').map((o) => [o.textContent, o.getAttribute('aria-disabled')])).toEqual([
        ['No results', 'true'],
      ]),
    );
    await expect(canvas.getByTestId('selected')).toHaveTextContent('Milano');
    await userEvent.tab();
    await waitFor(() => expect(input).toHaveValue('Milano'));
    await userEvent.click(canvas.getByRole('button', { name: 'Set from outside' }));
    await waitFor(() => expect(input).toHaveValue(OUTSIDE.label));
    await expect(args.onSelectedItemChange).toHaveBeenCalledTimes(1);
  },
};
