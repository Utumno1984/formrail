import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useListMutationFocus } from './use-list-mutation-focus';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Policy = 'apply' | 'refuse' | 'reverse';

interface ListProps {
  initial: string[];
  /** What the "consumer" does with a change: apply it, ignore it, or apply something else. */
  policy?: Policy;
  /** Disables the Remove button of these items (a real `disabled`: the element cannot take focus). */
  disabled?: readonly string[];
  /** Renders a nested list (with the same target keys) inside each item. */
  nested?: boolean;
}

/** A controlled list with Remove / Move up / Move down per item and an Add button after the list. */
function List({ initial, policy = 'apply', disabled = [], nested = false }: ListProps) {
  const [items, setItems] = useState(initial);
  const [renders, setRenders] = useState(0);
  const focus = useListMutationFocus(items);
  const onChange = (next: string[]) => {
    // An unrelated state update in the same event: a re-render with the old items.
    setRenders((n) => n + 1);
    if (policy === 'apply') setItems(next);
    if (policy === 'reverse') setItems([...next].reverse());
  };
  const remove = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    const heir = next[index] ?? next[index - 1];
    focus.requestFocus({ next, targets: heir === undefined ? ['add'] : [`remove:${heir}`, 'add'] });
    onChange(next);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    focus.requestFocus({ next, targets: [`${direction < 0 ? 'up' : 'down'}:${items[index]}`] });
    onChange(next);
  };
  const add = () => {
    const id = `new-${items.length + 1}`;
    const next = [...items, id];
    focus.requestFocus({ next, targets: [`name:${id}`] });
    onChange(next);
  };
  return (
    <div data-renders={renders}>
      <ul>
        {items.map((item, i) => (
          <li key={item}>
            {/* Before the item's own controls: a document-order lookup by key would find the nested one first. */}
            {nested ? <NestedList owner={item} /> : null}
            <input aria-label={`Name ${item}`} ref={focus.targetRef(`name:${item}`)} defaultValue={item} />
            <button type="button" ref={focus.targetRef(`up:${item}`)} onClick={() => move(i, -1)}>
              Up {item}
            </button>
            <button type="button" ref={focus.targetRef(`down:${item}`)} onClick={() => move(i, 1)}>
              Down {item}
            </button>
            <button type="button" ref={focus.targetRef(`remove:${item}`)} disabled={disabled.includes(item)} onClick={() => remove(i)}>
              Remove {item}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" ref={focus.targetRef('add')} onClick={add}>
        Add
      </button>
    </div>
  );
}

/** Same target keys as the outer list (`remove:<item>`): must never answer to the outer list's requests. */
function NestedList({ owner }: { owner: string }) {
  const [items] = useState(['a', 'b']);
  const focus = useListMutationFocus(items);
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>
          <button type="button" ref={focus.targetRef(`remove:${item}`)}>
            Inner {owner} {item}
          </button>
        </li>
      ))}
    </ul>
  );
}

const btn = (name: string) => screen.getByRole('button', { name });

describe('useListMutationFocus: add, remove, move with the keyboard', () => {
  it('Add focuses the new item; the focus is never on <body>', async () => {
    const u = userEvent.setup();
    render(<List initial={['a', 'b']} />);
    btn('Add').focus();
    await u.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Name new-3' })).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('Remove focuses the next item, else the previous one, else Add', async () => {
    const u = userEvent.setup();
    render(<List initial={['a', 'b', 'c']} />);
    btn('Remove b').focus();
    await u.keyboard('{Enter}');
    expect(btn('Remove c')).toHaveFocus();
    await u.keyboard('{Enter}');
    expect(btn('Remove a')).toHaveFocus();
    await u.keyboard(' ');
    expect(btn('Add')).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('Move keeps the focus on the same button of the same item, re-inserted elsewhere', async () => {
    const u = userEvent.setup();
    render(<List initial={['a', 'b', 'c']} />);
    btn('Up c').focus();
    await u.keyboard('{Enter}');
    expect(screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value)).toEqual(['a', 'c', 'b']);
    expect(btn('Up c')).toHaveFocus();
    await u.keyboard('{Enter}');
    expect(btn('Up c')).toHaveFocus();
    btn('Down a').focus();
    await u.keyboard('{Enter}');
    expect(btn('Down a')).toHaveFocus();
  });
});

describe('useListMutationFocus: fallback chain', () => {
  it('a target that cannot take the focus is skipped for the next one', async () => {
    const u = userEvent.setup();
    // After removing "a", the heir is "b", whose Remove button is disabled: the chain goes on to Add.
    render(<List initial={['a', 'b']} disabled={['b']} />);
    btn('Remove a').focus();
    await u.keyboard('{Enter}');
    expect(btn('Add')).toHaveFocus();
  });

  it('no target mounted and focusable: nothing is focused, one console.error in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Lonely() {
      const [items, setItems] = useState(['a']);
      const focus = useListMutationFocus(items);
      return (
        <button
          type="button"
          onClick={() => {
            focus.requestFocus({ next: [], targets: ['missing'] });
            setItems([]);
          }}
        >
          Clear
        </button>
      );
    }
    render(<Lonely />);
    const clear = btn('Clear');
    clear.focus();
    act(() => clear.click());
    expect(clear).toHaveFocus();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('["missing"]');
  });
});

describe('useListMutationFocus: controlled lists', () => {
  it('a change the consumer refuses never moves the focus, not even at a later re-render', async () => {
    const u = userEvent.setup();
    const { container } = render(<List initial={['a', 'b']} policy="refuse" />);
    btn('Remove a').focus();
    await u.keyboard('{Enter}');
    expect(container.firstElementChild).toHaveAttribute('data-renders', '1');
    expect(btn('Remove a')).toHaveFocus();
    await u.keyboard('{Enter}');
    expect(container.firstElementChild).toHaveAttribute('data-renders', '2');
    expect(btn('Remove a')).toHaveFocus();
  });

  it('a change the consumer transforms (other items than `next`) drops the request', async () => {
    const u = userEvent.setup();
    render(<List initial={['a', 'b', 'c']} policy="reverse" />);
    btn('Up c').focus();
    await u.keyboard('{Enter}');
    // `next` was [a, c, b]; the consumer rendered [b, c, a]: no focus move, the button keeps it.
    expect(btn('Up c')).toHaveFocus();
  });

  it('a request waits for the commit that shows `next`, then applies once', () => {
    const { result, rerender } = renderHook(({ items }) => useListMutationFocus(items), {
      initialProps: { items: ['a', 'b'] as readonly string[] },
    });
    const target = document.createElement('button');
    document.body.append(target);
    act(() => result.current.targetRef('t')(target));
    act(() => result.current.requestFocus({ next: ['b'], targets: ['t'] }));
    rerender({ items: ['a', 'b'] });
    expect(target).not.toHaveFocus();
    rerender({ items: ['b'] });
    expect(target).toHaveFocus();
    target.blur();
    rerender({ items: ['b'] });
    expect(target).not.toHaveFocus();
    target.remove();
  });

  it('items are compared one by one, never joined: keys with a separator in them do not collide', () => {
    const { result, rerender } = renderHook(({ items }) => useListMutationFocus(items), {
      initialProps: { items: ['x'] as readonly string[] },
    });
    const target = document.createElement('button');
    document.body.append(target);
    act(() => result.current.targetRef('t')(target));
    act(() => result.current.requestFocus({ next: ['a\nb', 'c'], targets: ['t'] }));
    rerender({ items: ['a', 'b\nc'] });
    expect(target).not.toHaveFocus();
    target.remove();
  });
});

describe('useListMutationFocus: keys and scoping', () => {
  it.each([
    ['double quote', 'say "hi"'],
    ['backslash', 'C:\\path\\'],
    ['brackets and quotes', `x"] , [y='z`],
    ['newline', 'a\nb'],
    ['non-BMP and NUL', '💥\u0000id'],
  ])('a key with a %s needs no escaping', async (_, id) => {
    const u = userEvent.setup();
    render(<List initial={['a', id, 'c']} />);
    // Remove: the heir is the item with the exotic id.
    btn('Remove a').focus();
    await u.keyboard('{Enter}');
    expect(btn(`Remove ${id}`)).toHaveFocus();
    // Move: the same button of the same (exotic) item, re-inserted after "c".
    btn(`Down ${id}`).focus();
    await u.keyboard('{Enter}');
    // Read from the buttons' text: an `<input>` value drops the newline of the id.
    expect(screen.getAllByRole('button', { name: /^Down / }).map((el) => el.textContent)).toEqual(['Down c', `Down ${id}`]);
    expect(btn(`Down ${id}`)).toHaveFocus();
  });

  it('a list nested in an item never answers to the outer list (same target keys)', async () => {
    const u = userEvent.setup();
    // Outer items "a", "b": removing the outer "a" asks for `remove:b`, which the nested lists also use.
    render(<List initial={['a', 'b']} nested />);
    btn('Remove a').focus();
    await u.keyboard('{Enter}');
    expect(btn('Remove b')).toHaveFocus();
  });

  it('targetRef is stable per key and the returned object is stable across renders', () => {
    const { result, rerender } = renderHook(({ items }) => useListMutationFocus(items), {
      initialProps: { items: ['a'] as readonly string[] },
    });
    const first = result.current;
    const ref = first.targetRef('k');
    rerender({ items: ['a', 'b'] });
    expect(result.current).toBe(first);
    expect(result.current.targetRef('k')).toBe(ref);
  });
});
