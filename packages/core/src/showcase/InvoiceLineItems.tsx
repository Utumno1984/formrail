// Story-only: the "Line items" section of the invoice page (add, remove, move up/down, per-line total). Not
// exported by the package. The lines are controlled by the form of the page; this component only decides which
// control takes the focus after an action (the control that had it may be gone or moved in the DOM).
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { lineTotal, nextLineId, type LineValues } from './invoice-lines';

export interface InvoiceLineItemsProps {
  lines: readonly LineValues[];
  /** Ids already used by the saved baseline: a new line never reuses one. */
  baselineIds: ReadonlySet<string>;
  onChange: (next: LineValues[]) => void;
}

const FOCUS_ATTR = 'data-line-focus';

const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

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

export function InvoiceLineItems({ lines, baselineIds, onChange }: InvoiceLineItemsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);
  // Which control takes the focus once the next render has committed (see `FOCUS_ATTR`).
  const pendingRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const wanted = pendingRef.current;
    if (wanted === null) return;
    pendingRef.current = null;
    for (const el of rootRef.current?.querySelectorAll<HTMLElement>(`[${FOCUS_ATTR}]`) ?? []) {
      if (el.getAttribute(FOCUS_ATTR) === wanted) {
        el.focus();
        return;
      }
    }
  });

  const update = (index: number, patch: Partial<LineValues>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const add = () => {
    const taken = new Set(baselineIds);
    for (const line of lines) taken.add(line.id);
    const { id, counter } = nextLineId(taken, counterRef.current);
    counterRef.current = counter;
    pendingRef.current = `description:${id}`;
    onChange([...lines, { id, description: '', quantity: '', unitPrice: '' }]);
  };

  const remove = (index: number) => {
    const next = lines.filter((_, i) => i !== index);
    // The row that takes the place of the removed one, else the previous one, else "Add line".
    const heir = next[index] ?? next[index - 1];
    pendingRef.current = heir ? `remove:${heir.id}` : 'add';
    onChange(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    // A boundary button is `aria-disabled`, which does not block the click.
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target]!, next[index]!];
    pendingRef.current = `${direction < 0 ? 'up' : 'down'}:${lines[index]!.id}`;
    onChange(next);
  };

  return (
    <div ref={rootRef} style={{ display: 'grid', gap: 16, maxWidth: 640, minWidth: 0 }}>
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
                      aria-label={`Move line ${n} up`}
                      aria-disabled={i === 0 || undefined}
                      onClick={() => move(i, -1)}
                      {...{ [FOCUS_ATTR]: `up:${line.id}` }}
                    >
                      Move up
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Move line ${n} down`}
                      aria-disabled={i === lines.length - 1 || undefined}
                      onClick={() => move(i, 1)}
                      {...{ [FOCUS_ATTR]: `down:${line.id}` }}
                    >
                      Move down
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Remove line ${n}`}
                      onClick={() => remove(i)}
                      {...{ [FOCUS_ATTR]: `remove:${line.id}` }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                <Field label={`Line ${n} description`} name={`lineItems.${i}.description`} required>
                  <Input
                    value={line.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    {...{ [FOCUS_ATTR]: `description:${line.id}` }}
                  />
                </Field>
                <div style={ROW_FIELDS}>
                  <Field label={`Line ${n} quantity`} name={`lineItems.${i}.quantity`} required>
                    <Input inputMode="numeric" value={line.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                  </Field>
                  <Field label={`Line ${n} unit price`} name={`lineItems.${i}.unitPrice`} required>
                    <Input inputMode="decimal" value={line.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} />
                  </Field>
                  <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                    <span aria-hidden="true">Total</span>
                    <span style={VISUALLY_HIDDEN}>{`Line ${n} total`}</span>
                    <span data-line-total={line.id}>{total ?? '—'}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div>
        <Button variant="secondary" onClick={add} {...{ [FOCUS_ATTR]: 'add' }}>
          Add line
        </Button>
      </div>
    </div>
  );
}
