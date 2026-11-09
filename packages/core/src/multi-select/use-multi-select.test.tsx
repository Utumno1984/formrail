import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMultiSelect, type MultiSelectOption, type UseMultiSelectOptions } from './use-multi-select';

afterEach(cleanup);

const OPTIONS: MultiSelectOption[] = [
  { value: 'a b', label: 'Alpha' },
  { value: 'a_20_b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
  { value: 'd', label: 'Delta' },
];

/** Bare markup driven by the hook, so the hook's own contract is tested without the component. */
function Harness({ initial = [], ...props }: { initial?: string[] } & Partial<UseMultiSelectOptions>) {
  const [values, setValues] = useState<string[]>(initial);
  const state = useMultiSelect({
    options: OPTIONS,
    values,
    onChange: (next) => {
      setValues(next);
      props.onChange?.(next);
    },
    filter: props.filter,
  });
  return (
    <>
      <input aria-label="x" {...state.getInputProps()} />
      <div {...state.getListboxProps()} hidden={!state.isOpen}>
        {state.filteredOptions.map((option) => (
          <div key={option.value} {...state.getOptionProps(option)}>
            {option.label}
          </div>
        ))}
      </div>
      <output data-testid="values">{values.join('|')}</output>
      <output data-testid="count">{String(state.announcedCount)}</output>
    </>
  );
}

const input = () => screen.getByRole('combobox');
const key = (k: string) => fireEvent.keyDown(input(), { key: k });

describe('useMultiSelect', () => {
  it('option ids are escaped injectively: keys that would collide after a naive escape stay distinct and space-free', () => {
    render(<Harness />);
    const ids = screen.getAllByRole('option', { hidden: true }).map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toMatch(/\s/u);
  });

  it('ArrowDown opens on the first enabled option, ArrowUp on the last; End/Home move inside the open list only', () => {
    render(<Harness />);
    key('Home');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    key('ArrowUp');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)).toHaveTextContent('Delta');
    key('ArrowUp');
    // Gamma is disabled: skipped.
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)).toHaveTextContent('Beta');
    key('Home');
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)).toHaveTextContent('Alpha');
    key('End');
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)).toHaveTextContent('Delta');
  });

  it('Enter with the list closed does nothing (implicit submit is left alone)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const event = fireEvent.keyDown(input(), { key: 'Enter' });
    expect(event).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('typing activates the first enabled match; emptying the text leaves no active option', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'ta' } });
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)).toHaveTextContent('Beta');
    fireEvent.change(input(), { target: { value: '' } });
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    key('Enter');
    expect(screen.getByTestId('values')).toHaveTextContent(/^$/u);
  });

  it('a custom filter receives the options and the text', () => {
    const filter = vi.fn((options: readonly MultiSelectOption[], text: string) =>
      options.filter((o) => o.value.startsWith(text)),
    );
    render(<Harness filter={filter} />);
    fireEvent.change(input(), { target: { value: 'd' } });
    expect(filter).toHaveBeenLastCalledWith(OPTIONS, 'd');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Delta']);
  });

  it('announcedCount: set by a user change, cleared by typing and by closing', () => {
    render(<Harness initial={['d']} />);
    expect(screen.getByTestId('count')).toHaveTextContent('null');
    key('ArrowDown');
    key('Enter');
    expect(screen.getByTestId('values')).toHaveTextContent('d|a b');
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    fireEvent.change(input(), { target: { value: 'x' } });
    expect(screen.getByTestId('count')).toHaveTextContent('null');
    fireEvent.change(input(), { target: { value: '' } });
    key('Backspace');
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    key('Escape');
    expect(screen.getByTestId('count')).toHaveTextContent('null');
  });

  it('blur while the window loses focus (input still active) keeps the text and the list', () => {
    render(<Harness />);
    act(() => input().focus());
    fireEvent.change(input(), { target: { value: 'al' } });
    fireEvent.blur(input());
    expect(input()).toHaveValue('al');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
  });

  it('a real blur closes and drops the text without a callback', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    act(() => input().focus());
    fireEvent.change(input(), { target: { value: 'al' } });
    act(() => input().blur());
    expect(input()).toHaveValue('');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });
});
