import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_REFERENCE_POOL, makeProducts, getProduct } from '../../../internal/demo-data';
import { minorToText, type OrderLineValues } from './order-lines';
import { SalesOrderLines } from './SalesOrderLines';

// #520: the wiring of the line editor (focus after an action, boundary buttons, the list price of a product, the
// ids of new lines). The editor is controlled, so these tests control it with the smallest possible parent.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

const active = makeProducts(DEMO_REFERENCE_POOL.products).filter((p) => p.status === 'active');
const line = (id: string, patch: Partial<OrderLineValues> = {}): OrderLineValues => ({
  id,
  productId: active[0]!.id,
  quantity: '1',
  unitPrice: '10.00',
  discount: '0',
  ...patch,
});

function Harness({
  initial,
  baselineIds = new Set<string>(),
  onChange,
}: {
  initial: OrderLineValues[];
  baselineIds?: ReadonlySet<string>;
  onChange?: (next: OrderLineValues[]) => void;
}) {
  const [lines, setLines] = useState(initial);
  return (
    <SalesOrderLines
      lines={lines}
      currency="EUR"
      baselineIds={baselineIds}
      onChange={(next) => {
        onChange?.(next);
        setLines(next);
      }}
    />
  );
}

const lineIds = () => [...document.querySelectorAll('[data-line-total]')].map((el) => el.getAttribute('data-line-total'));

describe('SalesOrderLines: wiring (#520)', () => {
  it('the Move up of the first line and the Move down of the last do nothing when clicked (aria-disabled does not block the click)', async () => {
    const onChange = vi.fn();
    render(<Harness initial={[line('a'), line('b')]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Move line 1 up' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Move line 1 up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move line 2 down' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(lineIds()).toEqual(['a', 'b']);
    // A one-line list has no move at all.
    cleanup();
    render(<Harness initial={[line('only')]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move line 1 up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move line 1 down' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(lineIds()).toEqual(['only']);
  });

  it('removing a MIDDLE line puts the focus on the Remove of the line that took its place (not the previous one)', async () => {
    render(<Harness initial={[line('a'), line('b'), line('c')]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove line 2' }));
    expect(lineIds()).toEqual(['a', 'c']);
    // The line that was third is now second: its Remove has the focus, not the one of line 1.
    expect(screen.getByRole('button', { name: 'Remove line 2' })).toHaveFocus();
    // Removing the last line falls back to the previous one.
    await userEvent.click(screen.getByRole('button', { name: 'Remove line 2' }));
    expect(lineIds()).toEqual(['a']);
    expect(screen.getByRole('button', { name: 'Remove line 1' })).toHaveFocus();
  });

  it('choosing a product keeps a unit price already typed, and fills the list price into an empty one', async () => {
    const [first, second] = [active[0]!, active[1]!];
    render(<Harness initial={[line('a', { productId: first.id, unitPrice: '12.34' }), line('b', { productId: first.id, unitPrice: '' })]} />);
    const pick = async (n: number) => {
      await userEvent.click(screen.getByRole('combobox', { name: `Line ${n} product` }));
      await userEvent.click(await screen.findByRole('option', { name: `${second.name} (${second.sku})` }));
    };
    await pick(1);
    expect(screen.getByRole('combobox', { name: 'Line 1 product' })).toHaveTextContent(second.name);
    expect(screen.getByRole('textbox', { name: /^Line 1 unit price/ })).toHaveValue('12.34');
    await pick(2);
    expect(screen.getByRole('combobox', { name: 'Line 2 product' })).toHaveTextContent(second.name);
    expect(screen.getByRole('textbox', { name: /^Line 2 unit price/ })).toHaveValue(minorToText(getProduct(second.id)!.listPriceMinor.EUR, 'EUR'));
  }, 30_000);

  it('a new line never takes the id of a saved line, also when the saved one was a "new-1" of an earlier session', async () => {
    const onChange = vi.fn();
    render(<Harness initial={[line('new-1')]} baselineIds={new Set(['new-1'])} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    expect(lineIds()).toEqual(['new-1', 'new-2']);
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    expect(lineIds()).toEqual(['new-1', 'new-2', 'new-3']);
    // After a remove, the next id is still new: the counter only grows.
    await userEvent.click(screen.getByRole('button', { name: 'Remove line 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    expect(lineIds()).toEqual(['new-1', 'new-2', 'new-4']);
    // And the rows are distinct React rows: no key collision warning, as many rows as lines.
    expect(screen.getAllByRole('button', { name: /^Remove line / })).toHaveLength(3);
  });
});
