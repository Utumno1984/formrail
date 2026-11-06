import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultComboboxFilter } from './filter';
import { useCombobox, type UseComboboxOptions } from './use-combobox';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

type Opts = Partial<UseComboboxOptions<City>>;

function Demo(options: Opts & { inputProps?: Parameters<ReturnType<typeof useCombobox<City>>['getInputProps']>[0] }) {
  const { inputProps, ...rest } = options;
  const combobox = useCombobox<City>({
    items: CITIES,
    itemToString: (c) => c.label,
    itemToKey: (c) => c.id,
    isItemDisabled: (c) => !!c.disabled,
    ...rest,
  });
  return (
    <div>
      <input aria-label="City" {...combobox.getInputProps(inputProps)} />
      <ul aria-label="Cities" {...combobox.getListboxProps()}>
        {combobox.filteredItems.map((city, index) => (
          <li key={city.id} {...combobox.getOptionProps(city, index)}>
            {city.label}
          </li>
        ))}
      </ul>
      <output data-testid="state">
        {JSON.stringify({ open: combobox.isOpen, active: combobox.activeIndex, n: combobox.filteredItems.length })}
      </output>
      <button type="button" onClick={combobox.reset}>
        reset
      </button>
      <button type="button" onClick={combobox.open}>
        open
      </button>
    </div>
  );
}

const input = () => screen.getByRole('combobox', { name: 'City' });
const state = () => JSON.parse(screen.getByTestId('state').textContent!) as { open: boolean; active: number; n: number };
const activeOption = () => {
  const id = input().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

describe('defaultComboboxFilter', () => {
  const toString = (c: City) => c.label;
  it('is case and diacritics insensitive, by substring', () => {
    expect(defaultComboboxFilter(CITIES, 'sao', toString).map((c) => c.id)).toEqual(['sp']);
    expect(defaultComboboxFilter(CITIES, 'PAULO', toString).map((c) => c.id)).toEqual(['sp']);
    expect(defaultComboboxFilter(CITIES, 'ila', toString).map((c) => c.id)).toEqual(['mi']);
    expect(defaultComboboxFilter(CITIES, 'são', toString)).toHaveLength(1);
  });
  it('keeps everything for an empty input and returns a copy', () => {
    const all = defaultComboboxFilter(CITIES, '', toString);
    expect(all).toEqual(CITIES);
    expect(all).not.toBe(CITIES);
  });
});

describe('useCombobox: ARIA contract', () => {
  it('wires combobox, listbox and options; activedescendant only when open with an active option', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const el = input();
    const listbox = screen.getByRole('listbox', { hidden: true });
    expect(el).toHaveAttribute('role', 'combobox');
    expect(el).toHaveAttribute('aria-expanded', 'false');
    expect(el).toHaveAttribute('aria-autocomplete', 'list');
    expect(el).toHaveAttribute('aria-controls', listbox.id);
    expect(el).not.toHaveAttribute('aria-activedescendant');
    await user.click(el);
    await user.keyboard('{ArrowDown}');
    expect(el).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('id');
    expect(el).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[2]).toHaveAttribute('aria-disabled', 'true');
    expect(options[0]).toHaveAttribute('aria-disabled', 'false');
    await user.keyboard('{Escape}');
    expect(el).not.toHaveAttribute('aria-activedescendant');
  });

  it('derives option ids from the key, safe for ID reference lists (spaces, underscores, no collisions)', () => {
    const items = [{ k: 'a b' }, { k: 'a_20_b' }, { k: 'x y z' }];
    function Keys() {
      const c = useCombobox({ items, itemToString: (i) => i.k, itemToKey: (i) => i.k });
      return (
        <ul {...c.getListboxProps()}>
          {items.map((i, n) => (
            <li key={i.k} {...c.getOptionProps(i, n)} />
          ))}
        </ul>
      );
    }
    render(<Keys />);
    const ids = screen.getAllByRole('option', { hidden: true }).map((o) => o.id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).not.toMatch(/\s/);
  });
});

describe('useCombobox: filter', () => {
  it('opens on typing, filters, activates the first match; no match = empty list and activeIndex -1', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(input());
    await user.keyboard('sao');
    expect(state()).toEqual({ open: true, active: 0, n: 1 });
    expect(screen.getByRole('option', { name: 'São Paulo' })).toBeInTheDocument();
    await user.clear(input());
    expect(state().n).toBe(CITIES.length);
    await user.keyboard('xyz');
    expect(state()).toEqual({ open: true, active: -1, n: 0 });
    expect(input()).not.toHaveAttribute('aria-activedescendant');
  });

  it('skips a disabled first match when activating', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(input());
    await user.keyboard('man');
    expect(state()).toEqual({ open: true, active: -1, n: 1 });
  });

  it('uses a replacement filter', async () => {
    const user = userEvent.setup();
    const filter = vi.fn((items: readonly City[], value: string) => items.filter((c) => c.label.startsWith(value)));
    render(<Demo filter={filter} />);
    await user.click(input());
    await user.keyboard('To');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Torino']);
    expect(filter).toHaveBeenCalledWith(CITIES, 'To');
  });

  it('filters with the controlled inputValue, not with an internal state', () => {
    render(<Demo inputValue="mod" />);
    expect(screen.getAllByRole('option', { hidden: true }).map((o) => o.textContent)).toEqual(['Modena']);
    expect(input()).toHaveValue('mod');
  });

  it('keeps the controlled inputValue until the consumer changes it, and reports the user changes', async () => {
    const user = userEvent.setup();
    const onInputValueChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState('');
      return (
        <Demo
          inputValue={value}
          onInputValueChange={(v) => {
            onInputValueChange(v);
            setValue(v);
          }}
        />
      );
    }
    render(<Controlled />);
    await user.click(input());
    await user.keyboard('tor');
    expect(onInputValueChange).toHaveBeenLastCalledWith('tor');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Torino']);
  });
});

describe('useCombobox: keyboard', () => {
  it('ArrowDown opens and moves skipping disabled; ArrowUp goes back; Home/End; focus stays on the input', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    expect(state()).toEqual({ open: true, active: 0, n: 5 });
    await user.keyboard('{ArrowDown}');
    expect(state().active).toBe(1);
    await user.keyboard('{ArrowDown}');
    expect(state().active).toBe(3); // Mantova (index 2) is disabled
    await user.keyboard('{ArrowUp}');
    expect(state().active).toBe(1);
    await user.keyboard('{End}');
    expect(state().active).toBe(4);
    await user.keyboard('{Home}');
    expect(state().active).toBe(0);
    expect(activeOption()).toBe(screen.getAllByRole('option')[0]);
    expect(input()).toHaveFocus();
  });

  it('Home and End are left to the caret when the list is closed', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(input());
    fireEvent.keyDown(input(), { key: 'Home' });
    expect(state().open).toBe(false);
    const event = new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
    input().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('Enter selects the active option and closes; the text follows', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelectedItemChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemChange).toHaveBeenCalledWith(CITIES[1]);
    expect(input()).toHaveValue('Modena');
    expect(state().open).toBe(false);
  });

  it('Enter with the list closed, with no active option, or with an empty list does nothing', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo onSelectedItemChange={onSelectedItemChange} items={[]} />);
    await user.click(input());
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}');
    expect(state()).toEqual({ open: true, active: -1, n: 0 });
    await user.keyboard('{Enter}');
    expect(onSelectedItemChange).not.toHaveBeenCalled();
  });

  it('with every option disabled, arrows activate nothing and Enter selects nothing', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo isItemDisabled={() => true} onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}{ArrowDown}{End}{Enter}');
    expect(state()).toEqual({ open: true, active: -1, n: 5 });
    expect(onSelectedItemChange).not.toHaveBeenCalled();
  });

  it('Escape with the list open closes without changing the selection; with it closed it restores the text', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo defaultSelectedItem={CITIES[0]} onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.keyboard('{Backspace}{Backspace}');
    expect(input()).toHaveValue('Mila');
    await user.keyboard('{Escape}');
    expect(state().open).toBe(false);
    expect(input()).toHaveValue('Mila');
    await user.keyboard('{Escape}');
    expect(input()).toHaveValue('Milano');
    expect(onSelectedItemChange).not.toHaveBeenCalled();
  });

  it('Tab closes without selecting', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.keyboard('mil');
    expect(state().active).toBe(0);
    await user.tab();
    expect(state().open).toBe(false);
    expect(onSelectedItemChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue('');
  });

  it('ArrowDown on a closed list with a selection activates the selected option', async () => {
    const user = userEvent.setup();
    render(<Demo defaultSelectedItem={CITIES[3]} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    expect(state()).toEqual({ open: true, active: 3, n: 5 });
    expect(screen.getAllByRole('option')[3]).toHaveAttribute('aria-selected', 'true');
  });

  it('recomputes the active option without crashing when items change under an open list', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Demo />);
    await user.click(input());
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Modena');
    rerender(<Demo items={CITIES.filter((c) => c.id !== 'mo')} />);
    expect(state().open).toBe(true);
    expect(state().active).toBe(-1);
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Milano');
  });
});

describe('useCombobox: mouse', () => {
  it('click on an option selects it once, keeps the focus on the input, and cancels the mousedown default', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    const option = screen.getByRole('option', { name: 'Torino' });
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    option.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await user.click(option);
    expect(onSelectedItemChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemChange).toHaveBeenCalledWith(CITIES[4]);
    expect(input()).toHaveValue('Torino');
    expect(input()).toHaveFocus();
  });

  it('a disabled option cannot be clicked; re-selecting the selected option does not call the callback', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo defaultSelectedItem={CITIES[0]} onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('option', { name: 'Mantova' }));
    expect(onSelectedItemChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: 'Milano' }));
    expect(onSelectedItemChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue('Milano');
  });

  it('hovering an option makes it active', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    await user.hover(screen.getByRole('option', { name: 'Torino' }));
    expect(state().active).toBe(4);
  });
});

describe('useCombobox: selection outside the results', () => {
  it('typing text that excludes the selection does not change it; blur reverts the text', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo defaultSelectedItem={CITIES[0]} onSelectedItemChange={onSelectedItemChange} />);
    expect(input()).toHaveValue('Milano');
    await user.click(input());
    await user.keyboard('{Control>}a{/Control}xyz');
    expect(input()).toHaveValue('xyz');
    expect(state().n).toBe(0);
    expect(onSelectedItemChange).not.toHaveBeenCalled();
    await user.tab();
    expect(input()).toHaveValue('Milano');
    expect(onSelectedItemChange).not.toHaveBeenCalled();
  });

  it('emptying the text and leaving keeps the selection unless clearOnEmpty', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    const { unmount } = render(<Demo defaultSelectedItem={CITIES[0]} onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.clear(input());
    await user.tab();
    expect(input()).toHaveValue('Milano');
    expect(onSelectedItemChange).not.toHaveBeenCalled();
    unmount();

    render(<Demo defaultSelectedItem={CITIES[0]} onSelectedItemChange={onSelectedItemChange} clearOnEmpty />);
    await user.click(input());
    await user.clear(input());
    await user.tab();
    expect(input()).toHaveValue('');
    expect(onSelectedItemChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemChange).toHaveBeenCalledWith(null);
  });

  it('clearOnEmpty: Escape on a closed list with empty text restores the text, it does not clear the selection', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo defaultSelectedItem={CITIES[0]} onSelectedItemChange={onSelectedItemChange} clearOnEmpty />);
    await user.click(input());
    await user.clear(input());
    await user.keyboard('{Escape}'); // closes the list
    await user.keyboard('{Escape}'); // list closed: restores the text
    expect(input()).toHaveValue('Milano');
    expect(onSelectedItemChange).not.toHaveBeenCalled();
  });

  it('emptied text activates no option: Enter does not replace the selection, it restores the text', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo defaultSelectedItem={CITIES[4]} onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.clear(input());
    expect(state()).toEqual({ open: true, active: -1, n: 5 });
    await user.keyboard('{Enter}');
    expect(onSelectedItemChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue('Torino');
    expect(state().open).toBe(false);
  });

  it('clearOnEmpty: Enter on emptied text clears the selection once', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo defaultSelectedItem={CITIES[4]} onSelectedItemChange={onSelectedItemChange} clearOnEmpty />);
    await user.click(input());
    await user.clear(input());
    await user.keyboard('{Enter}');
    expect(onSelectedItemChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemChange).toHaveBeenCalledWith(null);
    expect(input()).toHaveValue('');
  });

  it('losing the window focus (the input stays the active element) keeps the text and the list', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo defaultSelectedItem={CITIES[0]} onSelectedItemChange={onSelectedItemChange} clearOnEmpty />);
    await user.click(input());
    await user.clear(input());
    expect(input()).toHaveFocus();
    fireEvent.blur(input()); // what the browser fires on alt-tab: activeElement is still the input
    expect(input()).toHaveValue('');
    expect(state().open).toBe(true);
    expect(onSelectedItemChange).not.toHaveBeenCalled();
  });

  it('with the selection shown, the list is unfiltered', async () => {
    const user = userEvent.setup();
    render(<Demo defaultSelectedItem={CITIES[0]} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    expect(state().n).toBe(5);
  });
});

describe('useCombobox: no echo', () => {
  function Parent({ onChange }: { onChange: (item: City | null) => void }) {
    const [selected, setSelected] = useState<City | null>(null);
    return (
      <>
        <Demo
          selectedItem={selected}
          onSelectedItemChange={(item) => {
            onChange(item);
            setSelected(item);
          }}
        />
        <button type="button" onClick={() => setSelected(CITIES[1]!)}>
          set-in-list
        </button>
        <button type="button" onClick={() => setSelected({ id: 'zz', label: 'Zzz (not in list)' })}>
          set-outside
        </button>
      </>
    );
  }

  it('a selectedItem changed by the parent after mount (even outside items) shows its text and does not call back', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Parent onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'set-in-list' }));
    expect(input()).toHaveValue('Modena');
    await user.click(screen.getByRole('button', { name: 'set-outside' }));
    expect(input()).toHaveValue('Zzz (not in list)');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not overwrite the text the user is typing, and shows the new selection after leaving', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Parent onChange={onChange} />);
    await user.click(input());
    await user.keyboard('tor');
    // The external change comes while the user is typing; the click on the button would blur, so
    // dispatch the click without moving the focus.
    fireEvent.click(screen.getByRole('button', { name: 'set-outside' }));
    expect(input()).toHaveValue('tor');
    expect(onChange).not.toHaveBeenCalled();
    await user.tab();
    expect(input()).toHaveValue('Zzz (not in list)');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with inputValue controlled too, an external selection change does not call back and leaves the text to the consumer', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    const onInputValueChange = vi.fn();
    function Both() {
      const [selected, setSelected] = useState<City>(CITIES[0]!);
      const [text, setText] = useState('Milano');
      return (
        <>
          <Demo
            selectedItem={selected}
            inputValue={text}
            onSelectedItemChange={onSelectedItemChange}
            onInputValueChange={(v) => {
              onInputValueChange(v);
              setText(v);
            }}
          />
          <button type="button" onClick={() => setSelected(CITIES[1]!)}>
            select-modena
          </button>
          <button type="button" onClick={() => setText('Modena')}>
            text-modena
          </button>
        </>
      );
    }
    render(<Both />);
    await user.click(screen.getByRole('button', { name: 'select-modena' }));
    expect(onSelectedItemChange).not.toHaveBeenCalled();
    expect(onInputValueChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue('Milano'); // documented: the consumer owns the text
    // Entering and leaving without typing does not fire a text change the user did not make.
    await user.click(input());
    await user.tab();
    expect(onInputValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'text-modena' }));
    expect(input()).toHaveValue('Modena');
    expect(onSelectedItemChange).not.toHaveBeenCalled();
  });

  it('a controlled selection the parent refuses to apply reverts the text', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Demo selectedItem={null} onSelectedItemChange={onChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue('');
  });
});

describe('useCombobox: reset, open, close', () => {
  it('reset closes, drops the typed text and restores defaultSelectedItem without a callback', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo defaultSelectedItem={CITIES[0]} onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(input()).toHaveValue('Modena');
    onSelectedItemChange.mockClear();
    await user.click(screen.getByRole('button', { name: 'reset' }));
    expect(input()).toHaveValue('Milano');
    expect(state().open).toBe(false);
    expect(onSelectedItemChange).not.toHaveBeenCalled();
  });

  it('open() opens the list with zero active options', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(state()).toEqual({ open: true, active: -1, n: 5 });
  });
});

describe('useCombobox: composable getters', () => {
  it('consumer handlers run first and can preventDefault the built-in behaviour', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn((event: React.KeyboardEvent) => {
      if (event.key === 'ArrowDown') event.preventDefault();
    });
    render(<Demo inputProps={{ onKeyDown }} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    expect(onKeyDown).toHaveBeenCalled();
    expect(state().open).toBe(false);
    await user.keyboard('{ArrowUp}');
    expect(state().open).toBe(true);
  });

  it('composes the consumer ref with its own', () => {
    const ref = createRef<HTMLInputElement>();
    const calls: (HTMLInputElement | null)[] = [];
    render(<Demo inputProps={{ ref: (node: HTMLInputElement | null) => void calls.push(node) }} />);
    expect(calls.at(-1)).toBe(input());
    cleanup();
    render(<Demo inputProps={{ ref }} />);
    expect(ref.current).toBe(input());
  });

  it('keeps the composed input ref stable across renders while the consumer ref is stable', async () => {
    const user = userEvent.setup();
    const ref = vi.fn();
    render(<Demo inputProps={{ ref }} />);
    expect(ref).toHaveBeenCalledTimes(1);
    await user.click(input());
    await user.keyboard('mi');
    expect(ref).toHaveBeenCalledTimes(1); // re-renders did not detach and re-attach it
  });

  it('hovering an option activates it by key even when the consumer passes a group-relative index', async () => {
    const user = userEvent.setup();
    function Grouped() {
      const c = useCombobox<City>({ items: CITIES, itemToString: (x) => x.label, itemToKey: (x) => x.id });
      return (
        <div>
          <input aria-label="City" {...c.getInputProps()} />
          <ul {...c.getListboxProps()}>
            {c.filteredItems.map((city, i) => (
              <li key={city.id} {...c.getOptionProps(city, i % 2)}>
                {city.label}
              </li>
            ))}
          </ul>
          <output data-testid="active">{c.activeIndex}</output>
        </div>
      );
    }
    render(<Grouped />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    await user.hover(screen.getByRole('option', { name: 'Torino' }));
    expect(screen.getByTestId('active')).toHaveTextContent('4');
  });

  it('forwards extra attributes (id, placeholder) to the input', () => {
    render(<Demo inputProps={{ id: 'mine', placeholder: 'Citta' }} />);
    expect(input()).toHaveAttribute('id', 'mine');
    expect(input()).toHaveAttribute('placeholder', 'Citta');
  });
});

describe('useCombobox: no leak', () => {
  it('spread on input/ul/li gives no React warning and only valid attributes', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    const allowed = /^(id|role|aria-[a-z]+|autocomplete|value|style|hidden|class|type|data-testid)$/;
    for (const el of [input(), screen.getByRole('listbox'), ...screen.getAllByRole('option')]) {
      for (const name of el.getAttributeNames()) expect(name, `${el.tagName} ${name}`).toMatch(allowed);
    }
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('getters return plain enumerable DOM props only (no internal state)', () => {
    function Probe() {
      const c = useCombobox({ items: CITIES, itemToString: (x) => x.label, itemToKey: (x) => x.id });
      const keys = [
        ...Object.keys(c.getInputProps()),
        ...Object.keys(c.getListboxProps()),
        ...Object.keys(c.getOptionProps(CITIES[0]!, 0)),
      ];
      return <output data-testid="keys">{keys.join(',')}</output>;
    }
    render(<Probe />);
    const keys = screen.getByTestId('keys').textContent!.split(',');
    for (const key of keys) expect(key).toMatch(/^(on[A-Z]\w+|aria-[a-z]+|role|id|value|autoComplete|ref)$/);
  });
});

// SSR (render with react-dom/server, no DOM globals): use-combobox.ssr.test.tsx, node environment.
describe('useCombobox: dev warning', () => {
  it('warns about duplicate keys once, not on every render', async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<Demo itemToKey={() => 'same'} />);
    await user.click(input());
    await user.keyboard('mi');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicate keys'));
  });
});

describe('useCombobox: IME composition', () => {
  it('Enter during a composition does not select; after compositionend it does', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    fireEvent.compositionStart(input());
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSelectedItemChange).not.toHaveBeenCalled();
    expect(state().open).toBe(true);
    fireEvent.compositionEnd(input());
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSelectedItemChange).toHaveBeenCalledTimes(1);
  });

  it('ignores the keydown with isComposing / keyCode 229 fired after compositionend (Safari)', async () => {
    const user = userEvent.setup();
    const onSelectedItemChange = vi.fn();
    render(<Demo onSelectedItemChange={onSelectedItemChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(onSelectedItemChange).not.toHaveBeenCalled();
  });
});

describe('useCombobox: imperative open/close', () => {
  it('open() and close() drive isOpen', async () => {
    let api!: ReturnType<typeof useCombobox<City>>;
    function Capture() {
      api = useCombobox<City>({ items: CITIES, itemToString: (c) => c.label, itemToKey: (c) => c.id });
      return null;
    }
    render(<Capture />);
    act(() => api.open());
    expect(api.isOpen).toBe(true);
    act(() => api.close());
    await waitFor(() => expect(api.isOpen).toBe(false));
  });
});
