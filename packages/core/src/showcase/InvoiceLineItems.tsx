// Story-only: the "Line items" section of the invoice page (add, remove, move up/down, per-line total). Not
// exported by the package. The lines are controlled by the form of the page; this component only decides which
// control takes the focus after an action (the control that had it may be gone or moved in the DOM).
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { useListMutationFocus } from '../internal/use-list-mutation-focus';
import { lineTotal, nextLineId, type LineValues } from './invoice-lines';

export interface InvoiceLineItemsProps {
  lines: readonly LineValues[];
  /** Ids already used by the saved baseline: a new line never reuses one. */
  baselineIds: ReadonlySet<string>;
  onChange: (next: LineValues[]) => void;
  /** Story-only (#384): a help text for the Field of a path (`lineItems.1.quantity`). */
  fieldHelp?: ((path: string) => ReactNode) | undefined;
}

const LIST: CSSProperties = { display: 'grid', gap: 12, listStyle: 'none', margin: 0, padding: 0 };
const ROW: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 12,
  minWidth: 0,
  border: '1px solid #d0d5dd',
  borderRadius: 8,
};
const ROW_HEADER: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'space-between' };
const ROW_ACTIONS: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const ROW_FIELDS: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
};

/**
 * Story-only (#384): the props of a Field for the help an addon gives it. A help takes the room the Field reserves
 * for a one-line error (the same height: the gap and one caption line), so a help appearing or going away moves
 * nothing below the Field; with an error shown as well, the Field grows by the help line. No help: no prop at all
 * (the Field exactly as without an addon).
 */
export function helpProps(
  fieldHelp: ((path: string) => ReactNode) | undefined,
  path: string,
): { help?: ReactNode; reserveMessageSpace?: boolean } {
  const help = fieldHelp?.(path);
  return help === undefined || help === null || help === false ? {} : { help, reserveMessageSpace: false };
}

export function InvoiceLineItems({ lines, baselineIds, onChange, fieldHelp }: InvoiceLineItemsProps) {
  const counterRef = useRef(0);
  // Which control takes the focus once the form shows the lines of the action. Target keys:
  // `<action>:<line id>` for the controls of a line, `add` for the button after the list.
  const focus = useListMutationFocus(lines.map((line) => line.id));
  const ids = (next: readonly LineValues[]) => next.map((line) => line.id);

  const update = (index: number, patch: Partial<LineValues>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const add = () => {
    // `counterRef` only grows, so an id made here never repeats one made here before: only the saved ids can clash.
    const { id, counter } = nextLineId(baselineIds, counterRef.current);
    counterRef.current = counter;
    const next = [...lines, { id, description: '', quantity: '', unitPrice: '' }];
    focus.requestFocus({ next: ids(next), targets: [`description:${id}`] });
    onChange(next);
  };

  const remove = (index: number) => {
    const next = lines.filter((_, i) => i !== index);
    // The row that takes the place of the removed one, else the previous one, else "Add line".
    // `heir` is a row object here (truthy whenever present): a plain truthiness check is right. In
    // `FileUpload` it is a key string where '' is a valid heir, hence `=== undefined` there: do not unify.
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

  return (
    // `position: relative`: the visually hidden spans are absolutely positioned and must stay inside the scroller.
    <div style={{ position: 'relative', display: 'grid', gap: 16, maxWidth: 640, minWidth: 0 }}>
      {lines.length === 0 ? (
        <p style={{ margin: 0 }}>No line items</p>
      ) : (
        <ol style={LIST}>
          {lines.map((line, i) => {
            const n = i + 1;
            const total = lineTotal(line);
            return (
              <li key={line.id} style={ROW}>
                <div style={ROW_HEADER}>
                  <strong>Line {n}</strong>
                  <div style={ROW_ACTIONS}>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-disabled={i === 0 || undefined}
                      onClick={() => move(i, -1)}
                      ref={focus.targetRef(`up:${line.id}`)}
                    >
                      <span>
                        Move <span className="sr-only">{`line ${n}`}</span> up
                      </span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-disabled={i === lines.length - 1 || undefined}
                      onClick={() => move(i, 1)}
                      ref={focus.targetRef(`down:${line.id}`)}
                    >
                      <span>
                        Move <span className="sr-only">{`line ${n}`}</span> down
                      </span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => remove(i)}
                      ref={focus.targetRef(`remove:${line.id}`)}
                    >
                      <span>
                        Remove <span className="sr-only">{`line ${n}`}</span>
                      </span>
                    </Button>
                  </div>
                </div>
                <Field label={`Line ${n} description`} name={`lineItems.${i}.description`} required {...helpProps(fieldHelp, `lineItems.${i}.description`)}>
                  <Input
                    value={line.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    ref={focus.targetRef(`description:${line.id}`)}
                  />
                </Field>
                <div style={ROW_FIELDS}>
                  <Field label={`Line ${n} quantity`} name={`lineItems.${i}.quantity`} required {...helpProps(fieldHelp, `lineItems.${i}.quantity`)}>
                    <Input inputMode="numeric" value={line.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                  </Field>
                  <Field label={`Line ${n} unit price`} name={`lineItems.${i}.unitPrice`} required {...helpProps(fieldHelp, `lineItems.${i}.unitPrice`)}>
                    <Input inputMode="decimal" value={line.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} />
                  </Field>
                  <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                    <span aria-hidden="true">Total</span>
                    <span className="sr-only">{`Line ${n} total`}</span>
                    <span data-line-total={line.id}>{total ?? '—'}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div>
        <Button variant="secondary" onClick={add} ref={focus.targetRef('add')}>
          Add line
        </Button>
      </div>
    </div>
  );
}
