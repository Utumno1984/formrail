// Story-only (#520): the "Lines" section of the sales order page (add, remove, move up/down, product, quantity,
// unit price, discount, per-line total). Not exported by the package. The lines are controlled by the form of the
// page; this component only decides which control takes the focus after an action (the control that had it may be
// gone or moved in the DOM). It is the invoices' line editor (`InvoiceLineItems`) with the fields of an order line:
// copy whichever of the two is closer to your record.
import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { Button } from '../../../button/Button';
import { Field } from '../../../field/Field';
import { Input } from '../../../input/Input';
import {
  DEMO_REFERENCE_POOL,
  formatMoney,
  getProduct,
  makeProducts,
  type DemoCurrency,
} from '../../../internal/demo-data';
import { useListMutationFocus } from '../../../internal/use-list-mutation-focus';
import { Select } from '../../../select/Select';
import { helpProps } from '../invoices/InvoiceLineItems';
import { lineTotal, minorToText, nextLineId, type OrderLineValues } from './order-lines';

export interface SalesOrderLinesProps {
  lines: readonly OrderLineValues[];
  currency: DemoCurrency;
  /** Ids already used by the saved baseline: a new line never reuses one. */
  baselineIds: ReadonlySet<string>;
  onChange: (next: OrderLineValues[]) => void;
  /** The order cannot be edited (a cancelled order): the fields are locked and no button changes the lines. */
  readOnly?: boolean;
  /** Why the lines cannot be edited, shown and linked to the locked fields. */
  readOnlyReason?: string;
  /** The error of the list itself ("at least one line"), linked to "Add line" with `aria-describedby`. */
  listError?: string | undefined;
  /** Story-only (#384): a help text for the Field of a path (`lines.1.quantity`). */
  fieldHelp?: ((path: string) => ReactNode) | undefined;
}

const LIST: CSSProperties = { display: 'grid', gap: 12, listStyle: 'none', margin: 0, padding: 0 };
const ROW: CSSProperties = { display: 'grid', gap: 12, padding: 12, minWidth: 0, border: '1px solid #d0d5dd', borderRadius: 8 };
const ROW_HEADER: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'space-between' };
const ROW_ACTIONS: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const ROW_FIELDS: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
};

// The products an order can still be given: the active ones of the demo catalogue (a discontinued product stays
// on the lines that already carry it, shown through `unknownValueLabel`, but cannot be picked for a new one).
let productOptions: { value: string; label: string; textValue: string }[] | undefined;
const options = () =>
  (productOptions ??= makeProducts(DEMO_REFERENCE_POOL.products)
    .filter((p) => p.status === 'active')
    .map((p) => ({ value: p.id, label: `${p.name} (${p.sku})`, textValue: p.name })));

/** The product of a line that is not among the options (a discontinued one): still named, never a bare id. */
const productLabel = (productId: string): string => {
  const product = getProduct(productId);
  return product ? `${product.name} (${product.sku})${product.status === 'discontinued' ? ' - discontinued' : ''}` : productId;
};

export function SalesOrderLines({ lines, currency, baselineIds, onChange, readOnly = false, readOnlyReason, listError, fieldHelp }: SalesOrderLinesProps) {
  const counterRef = useRef(0);
  const productOptionsList = useMemo(options, []);
  // Which control takes the focus once the form shows the lines of the action. Target keys:
  // `<action>:<line id>` for the controls of a line, `add` for the button after the list.
  const focus = useListMutationFocus(lines.map((line) => line.id));
  const ids = (next: readonly OrderLineValues[]) => next.map((line) => line.id);
  const state = readOnly ? ({ state: 'locked', stateReason: readOnlyReason ?? 'This order cannot be edited.' } as const) : {};
  const errorId = 'sales-order-lines-error';

  const update = (index: number, patch: Partial<OrderLineValues>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const add = () => {
    // `counterRef` only grows, so an id made here never repeats one made here before: only the saved ids can clash.
    const { id, counter } = nextLineId(baselineIds, counterRef.current);
    counterRef.current = counter;
    const next = [...lines, { id, productId: '', quantity: '1', unitPrice: '', discount: '0' }];
    focus.requestFocus({ next: ids(next), targets: [`product:${id}`] });
    onChange(next);
  };

  const remove = (index: number) => {
    const next = lines.filter((_, i) => i !== index);
    // The row that takes the place of the removed one, else the previous one, else "Add line".
    const heir = next[index] ?? next[index - 1];
    focus.requestFocus({ next: ids(next), targets: heir ? [`remove:${heir.id}`, 'add'] : ['add'] });
    onChange(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    // A boundary button is `aria-disabled`, which does not block the click.
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target]!, next[index]!];
    focus.requestFocus({ next: ids(next), targets: [`${direction < 0 ? 'up' : 'down'}:${lines[index]!.id}`] });
    onChange(next);
  };

  const pickProduct = (index: number, productId: string) => {
    // A line with no price yet takes the product's list price in the order's currency (the user may change it).
    const line = lines[index]!;
    const listPrice = getProduct(productId)?.listPriceMinor[currency];
    update(index, {
      productId,
      ...(line.unitPrice === '' && listPrice !== undefined ? { unitPrice: minorToText(listPrice, currency) } : {}),
    });
  };

  return (
    // `position: relative`: the visually hidden spans are absolutely positioned and must stay inside the scroller.
    <div style={{ position: 'relative', display: 'grid', gap: 16, maxWidth: 720, minWidth: 0 }}>
      {lines.length === 0 ? (
        <p style={{ margin: 0 }}>No lines</p>
      ) : (
        <ol style={LIST}>
          {lines.map((line, i) => {
            const n = i + 1;
            const total = lineTotal(line, currency);
            const inOptions = productOptionsList.some((o) => o.value === line.productId);
            return (
              <li key={line.id} style={ROW}>
                <div style={ROW_HEADER}>
                  <strong>Line {n}</strong>
                  {readOnly ? null : (
                    <div style={ROW_ACTIONS}>
                      <Button variant="secondary" size="sm" aria-disabled={i === 0 || undefined} onClick={() => move(i, -1)} ref={focus.targetRef(`up:${line.id}`)}>
                        <span>
                          Move <span className="sr-only">{`line ${n}`}</span> up
                        </span>
                      </Button>
                      <Button variant="secondary" size="sm" aria-disabled={i === lines.length - 1 || undefined} onClick={() => move(i, 1)} ref={focus.targetRef(`down:${line.id}`)}>
                        <span>
                          Move <span className="sr-only">{`line ${n}`}</span> down
                        </span>
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => remove(i)} ref={focus.targetRef(`remove:${line.id}`)}>
                        <span>
                          Remove <span className="sr-only">{`line ${n}`}</span>
                        </span>
                      </Button>
                    </div>
                  )}
                </div>
                <Field label={`Line ${n} product`} name={`lines.${i}.productId`} required {...state} {...helpProps(fieldHelp, `lines.${i}.productId`)}>
                  <Select
                    options={productOptionsList}
                    placeholder="Choose a product"
                    emptyLabel="No products"
                    value={line.productId || undefined}
                    unknownValueLabel={line.productId && !inOptions ? productLabel(line.productId) : undefined}
                    onValueChange={(v) => pickProduct(i, v)}
                    ref={focus.targetRef(`product:${line.id}`)}
                  />
                </Field>
                <div style={ROW_FIELDS}>
                  <Field label={`Line ${n} quantity`} name={`lines.${i}.quantity`} required {...state} {...helpProps(fieldHelp, `lines.${i}.quantity`)}>
                    <Input inputMode="numeric" value={line.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                  </Field>
                  <Field label={`Line ${n} unit price (${currency})`} name={`lines.${i}.unitPrice`} required {...state} {...helpProps(fieldHelp, `lines.${i}.unitPrice`)}>
                    <Input inputMode={currency === 'JPY' ? 'numeric' : 'decimal'} value={line.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} />
                  </Field>
                  <Field label={`Line ${n} discount (%)`} name={`lines.${i}.discount`} required {...state} {...helpProps(fieldHelp, `lines.${i}.discount`)}>
                    <Input inputMode="numeric" value={line.discount} onChange={(e) => update(i, { discount: e.target.value })} />
                  </Field>
                  <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                    <span aria-hidden="true">Total</span>
                    <span className="sr-only">{`Line ${n} total`}</span>
                    <span data-line-total={line.id}>{total === null ? '—' : formatMoney(total, currency)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {listError ? (
        <p id={errorId} className="text-rop-error" style={{ margin: 0 }}>
          {listError}
        </p>
      ) : null}
      {readOnly ? (
        <p style={{ margin: 0 }}>{readOnlyReason}</p>
      ) : (
        <div>
          <Button
            variant="secondary"
            onClick={add}
            ref={focus.targetRef('add')}
            data-rop-name="lines"
            aria-invalid={listError ? true : undefined}
            aria-describedby={listError ? errorId : undefined}
          >
            Add line
          </Button>
        </div>
      )}
    </div>
  );
}
