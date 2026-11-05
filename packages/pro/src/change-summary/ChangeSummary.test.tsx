import { createRef, type ReactNode } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangeSummary } from './ChangeSummary';
import { computeChangeSummary } from './compute-change-summary';
import { formatChangeValue } from './format-change-value';
import type { ChangeEntry } from './types';

afterEach(cleanup);

function entry(partial: Partial<ChangeEntry> & Pick<ChangeEntry, 'kind'>): ChangeEntry {
  const path = partial.path ?? 'amount';
  const label = partial.label ?? 'Amount';
  return {
    path,
    label,
    labelPath: label.split(' > '),
    before: undefined,
    after: undefined,
    beforeMissing: false,
    afterMissing: false,
    ...partial,
  };
}

/** Text a screen reader gets: DOM order, hidden-visually text included, aria-hidden excluded. */
function readText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return '';
  return Array.from(node.childNodes).map(readText).join('');
}

const common = { locale: 'en-US', timeZone: 'UTC' } as const;

describe('<ChangeSummary />', () => {
  it('lists the entries in order with an accessible name, one listitem each', () => {
    const entries = [
      entry({ kind: 'changed', path: 'a', label: 'Amount', before: 100, after: 120 }),
      entry({ kind: 'added', path: 'b', label: 'Note', after: 'Hello' }),
      entry({ kind: 'removed', path: 'c', label: 'Memo', before: 'Old' }),
    ];
    render(<ChangeSummary entries={entries} {...common} />);
    const list = screen.getByRole('list', { name: 'Changes' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map(readText)).toEqual([
      'Amount, changed, from 100 to 120',
      'Note, added, Hello',
      'Memo, removed, Old',
    ]);
  });

  it('shows the kind as visible text', () => {
    render(<ChangeSummary entries={[entry({ kind: 'added', after: 'x' })]} />);
    expect(screen.getByText('added')).toBeVisible();
  });

  it('uses the label prop as the list name', () => {
    render(<ChangeSummary entries={[entry({ kind: 'added', after: 1 })]} label="Pending edits" />);
    expect(screen.getByRole('list', { name: 'Pending edits' })).toBeInTheDocument();
  });

  it('shows emptyLabel and no list when there are no entries, and follows emptyLabel', () => {
    const { rerender } = render(<ChangeSummary entries={[]} />);
    expect(screen.getByText('No changes')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    rerender(<ChangeSummary entries={[]} emptyLabel="Nothing to save" />);
    expect(screen.getByText('Nothing to save')).toBeInTheDocument();
    expect(screen.queryByText('No changes')).toBeNull();
  });

  it('switches between list and empty text after mount without orphan nodes', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const one = [entry({ kind: 'added', after: 1 })];
    const { rerender, container } = render(<ChangeSummary entries={[]} />);
    rerender(<ChangeSummary entries={one} />);
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(screen.queryByText('No changes')).toBeNull();
    rerender(<ChangeSummary entries={[]} />);
    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('has no live region, status or alert', () => {
    const { container } = render(<ChangeSummary entries={[entry({ kind: 'added', after: 1 })]} />);
    expect(container.querySelector('[aria-live],[role="status"],[role="alert"],[aria-atomic]')).toBeNull();
    render(<ChangeSummary entries={[]} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keys on the path: the same label on different paths gives no duplicate key warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entries = [
      entry({ kind: 'added', path: 'x.1', label: 'Same', after: 1 }),
      entry({ kind: 'added', path: 'x.2', label: 'Same', after: 2 }),
    ];
    render(<ChangeSummary entries={entries} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('gives no duplicate key warning when an added and a removed item share one path', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entries = [
      entry({ kind: 'removed', path: 'lines.1', label: 'Lines > Item 2', before: 'old' }),
      entry({ kind: 'added', path: 'lines.1', label: 'Lines > Item 2', after: 'new' }),
    ];
    render(<ChangeSummary entries={entries} />);
    expect(screen.getAllByRole('listitem').map(readText)).toEqual([
      'Lines > Item 2, removed, old',
      'Lines > Item 2, added, new',
    ]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('merges className with tailwind-merge (p-0 replaces the default padding)', () => {
    const { container } = render(<ChangeSummary entries={[]} className="p-0" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('p-0');
    expect(root.className).not.toMatch(/(^|\s)p-4(\s|$)/);
  });

  it('forwards the ref to the root and other HTML attributes', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChangeSummary ref={ref} entries={[]} data-testid="root" id="cs" />);
    expect(ref.current).toBe(screen.getByTestId('root'));
    expect(ref.current?.id).toBe('cs');
  });

  it('does not leak its own props to the DOM', () => {
    const { container } = render(
      <ChangeSummary
        entries={[entry({ kind: 'added', after: 1 })]}
        renderValue={() => 'x'}
        valueLabels={{ yes: 'Si' }}
        locale="en-US"
        timeZone="UTC"
        emptyLabel="e"
        label="l"
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    const attrs = root.getAttributeNames().join(' ').toLowerCase();
    for (const name of ['entries', 'rendervalue', 'valuelabels', 'locale', 'timezone', 'emptylabel']) {
      expect(attrs).not.toContain(name);
    }
  });

  describe('value rendering', () => {
    const fixture = [
      entry({ kind: 'changed', path: 'p1', label: 'Paid', before: false, after: true }),
      entry({ kind: 'changed', path: 'p2', label: 'Due', before: new Date('2026-03-05T12:00:00Z'), after: new Date('2026-04-01T12:00:00Z') }),
      entry({ kind: 'changed', path: 'p3', label: 'Note', before: '', after: null }),
      entry({ kind: 'changed', path: 'p4', label: 'Count', before: 0, after: 1500.5 }),
      entry({ kind: 'changed', path: 'p5', label: 'Tags', before: [], after: [1, 2] }),
      entry({ kind: 'added', path: 'p6', label: 'Line Items > Item 3', after: { id: 'c', unitPrice: 5, paid: true } }),
      entry({ kind: 'added', path: 'p7', label: 'Bad', after: new Date('x') }),
      entry({ kind: 'added', path: 'p8', label: 'Map', after: new Map() }),
    ];

    it('never prints true / false, Date strings or [object', () => {
      const { container } = render(<ChangeSummary entries={fixture} {...common} />);
      const text = container.textContent ?? '';
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        expect(['true', 'false']).not.toContain((n.textContent ?? '').trim());
      }
      expect(text).not.toMatch(/GMT|\w{3} \w{3} \d{2} \d{4}|\[object/);
      expect(text).toContain('Yes');
      expect(text).toContain('Invalid date');
      expect(text).toContain('Mar 5, 2026');
    });

    it('honours locale and valueLabels', () => {
      const e = [entry({ kind: 'changed', before: new Date('2026-03-05T12:00:00Z'), after: true })];
      render(<ChangeSummary entries={e} locale="de-DE" timeZone="UTC" valueLabels={{ yes: 'Ja', changed: 'geändert', from: 'von', to: 'zu' }} />);
      expect(readText(screen.getByRole('listitem'))).toBe('Amount, geändert, von 05.03.2026 zu Ja');
    });

    it('tells apart empty, no value, false and zero', () => {
      const e = [
        entry({ kind: 'added', path: '1', label: 'A', after: '' }),
        entry({ kind: 'changed', path: '2', label: 'B', before: null, after: false }),
        entry({ kind: 'added', path: '3', label: 'C', after: 0 }),
      ];
      render(<ChangeSummary entries={e} />);
      const items = screen.getAllByRole('listitem').map(readText);
      expect(items).toEqual(['A, added, Empty', 'B, changed, from No value to No', 'C, added, 0']);
    });

    it.each([
      ['null to undefined', { before: null, after: undefined }, 'from Null to Undefined'],
      ['undefined to null', { before: undefined, after: null }, 'from Undefined to Null'],
      ['null to a missing key', { before: null, afterMissing: true }, 'from Null to Missing'],
      ['undefined to a missing key', { before: undefined, afterMissing: true }, 'from Undefined to Missing'],
      ['a missing key to null', { beforeMissing: true, after: null }, 'from Missing to Null'],
      ['a missing key to undefined', { beforeMissing: true, after: undefined }, 'from Missing to Undefined'],
    ])('gives each no-value state its own text on a changed entry: %s', (_, sides, expected) => {
      render(<ChangeSummary entries={[entry({ kind: 'changed', ...sides })]} {...common} />);
      expect(readText(screen.getByRole('listitem'))).toBe(`Amount, changed, ${expected}`);
      cleanup();
    });

    it('the texts of the no-value states follow valueLabels', () => {
      const e = [
        entry({ kind: 'changed', path: 'a', before: null, after: undefined }),
        entry({ kind: 'changed', path: 'b', beforeMissing: true, after: null }),
      ];
      render(<ChangeSummary entries={e} valueLabels={{ nullValue: 'Nullo', undefinedValue: 'Indefinito', missingValue: 'Assente' }} />);
      expect(screen.getAllByRole('listitem').map(readText)).toEqual([
        'Amount, changed, from Nullo to Indefinito',
        'Amount, changed, from Assente to Nullo',
      ]);
    });

    it('writes out no-value states inside arrays that would otherwise look the same', () => {
      const e = [
        entry({ kind: 'changed', path: 'a', before: [null], after: [undefined] }),
        entry({ kind: 'changed', path: 'b', before: [{ x: null }], after: [{}] }),
      ];
      render(<ChangeSummary entries={e} {...common} />);
      expect(screen.getAllByRole('listitem').map(readText)).toEqual([
        'Amount, changed, from [Null] to [Undefined]',
        'Amount, changed, from [{x: Null}] to [{}]',
      ]);
    });

    it('the compact text stays when only one side is a no-value state', () => {
      render(<ChangeSummary entries={[entry({ kind: 'changed', before: null, after: 'x' })]} {...common} />);
      expect(readText(screen.getByRole('listitem'))).toBe('Amount, changed, from No value to x');
    });

    it('a missing key does not change the text of the side shown by added / removed', () => {
      const e = [
        entry({ kind: 'added', path: 'a', after: '', beforeMissing: true }),
        entry({ kind: 'removed', path: 'b', before: [], afterMissing: true }),
      ];
      render(<ChangeSummary entries={e} {...common} />);
      expect(screen.getAllByRole('listitem').map(readText)).toEqual(['Amount, added, Empty', 'Amount, removed, No items']);
    });

    it('renderValue gets a missing key as undefined, with the flag on the entry', () => {
      const e = entry({ kind: 'changed', before: null, afterMissing: true });
      const renderValue = vi.fn((v: unknown, en: ChangeEntry): ReactNode => (v === undefined && en.afterMissing ? 'gone' : 'null'));
      render(<ChangeSummary entries={[e]} renderValue={renderValue} />);
      expect(readText(screen.getByRole('listitem'))).toBe('Amount, changed, from null to gone');
    });

    it('mutes the empty / no value texts only', () => {
      const e = [entry({ kind: 'changed', before: '', after: 'x' })];
      render(<ChangeSummary entries={e} />);
      // Muted modifier of pro's component classes (was the `text-rop-text-muted` utility; the
      // computed colour / italic is asserted in the browser, e2e/change-summary.spec.ts).
      expect(screen.getByText('Empty').className).toContain('rop-pro-change-summary__value--muted');
      expect(screen.getByText('x').className).not.toContain('rop-pro-change-summary__value--muted');
    });

    it('keeps line breaks and spaces of a string (pre-wrap class)', () => {
      render(<ChangeSummary entries={[entry({ kind: 'added', after: 'a\n  b' })]} />);
      const node = screen.getByText((_, el) => el?.textContent === 'a\n  b' && el.tagName === 'SPAN' && el.className.split(' ').includes('rop-pro-change-summary__value'));
      expect(node).toBeInTheDocument();
    });

    it.each([
      ['same day, different time', new Date('2026-03-05T10:00:00Z'), new Date('2026-03-05T11:30:00Z')],
      ['close numbers', 10, 10.0001],
      ['trailing space', 'abc ', 'abc'],
      ['string against number', '5', 5],
      ['empty string against its label', '', 'Empty'],
      ['same second, different ms', new Date('2026-03-05T10:00:00.100Z'), new Date('2026-03-05T10:00:00.900Z')],
    ])('shows before and after differently on a collision: %s', (_, before, after) => {
      // really a collision (to the eye: white space does not show)
      expect(formatChangeValue(before, common).trim()).toBe(formatChangeValue(after, common).trim());
      render(<ChangeSummary entries={[entry({ kind: 'changed', before, after })]} {...common} />);
      const text = readText(screen.getByRole('listitem'));
      const match = /from (.*) to (.*)$/s.exec(text);
      expect(match).not.toBeNull();
      expect(match?.[1]).not.toBe(match?.[2]);
    });

    it.each([
      ['arrays of the same length', ['a', 'b'], ['a', 'c'], 'from ["a", "b"] to ["a", "c"]'],
      ['nested objects', { a: { x: 1 } }, { a: { x: 2 } }, 'from {a: {x: 1}} to {a: {x: 2}}'],
      ['Maps of the same size', new Map([['k', 1]]), new Map([['k', 2]]), 'from Map {"k" => 1} to Map {"k" => 2}'],
      ['bigint against number', 10n, 10, 'from 10n to 10'],
    ])('tells apart values whose default texts collide: %s', (_, before, after, expected) => {
      // really a collision of the default rendering (`2 items` / `A: …` / `Unsupported value` / `10`)
      expect(formatChangeValue(before, common)).toBe(formatChangeValue(after, common));
      render(<ChangeSummary entries={[entry({ kind: 'changed', before, after })]} {...common} />);
      expect(readText(screen.getByRole('listitem'))).toBe(`Amount, changed, ${expected}`);
    });

    it('says "contents differ" as a last resort when the written-out contents still match', () => {
      class Money {
        constructor(public cents: number) {}
      }
      const long = (last: number) => [...Array.from({ length: 60 }, () => 0), last];
      render(
        <ChangeSummary
          entries={[
            entry({ kind: 'changed', path: 'm', before: new Money(1), after: new Money(2) }),
            entry({ kind: 'changed', path: 'l', label: 'Long', before: long(1), after: long(2) }),
          ]}
          {...common}
          valueLabels={{ contentsDiffer: 'differs' }}
        />,
      );
      const [money, longItem] = screen.getAllByRole('listitem').map(readText);
      expect(money).toBe('Amount, changed, from Unsupported value to Unsupported value (differs)');
      expect(longItem).toMatch(/^Long, changed, from \[0, 0.*… to \[0, 0.*… \(differs\)$/);
    });

    it('does not use precise formatting when the sides already differ', () => {
      render(<ChangeSummary entries={[entry({ kind: 'changed', before: 'a', after: 'b' })]} />);
      expect(readText(screen.getByRole('listitem'))).toBe('Amount, changed, from a to b');
    });

    it('survives an invalid locale and time zone', () => {
      render(<ChangeSummary entries={[entry({ kind: 'added', after: new Date('2026-03-05T12:00:00Z') })]} locale="xx-invalid" timeZone="Mars/Olympus" />);
      expect(readText(screen.getByRole('listitem'))).toMatch(/2026/);
    });

    it('survives a circular object value', () => {
      const a: Record<string, unknown> = { name: 'loop' };
      a.self = a;
      render(<ChangeSummary entries={[entry({ kind: 'added', after: a })]} />);
      expect(readText(screen.getByRole('listitem'))).toBe('Amount, added, Name: loop, Self: …');
    });
  });

  describe('renderValue', () => {
    it('is called once per shown value with (value, entry) and never for the absent side', () => {
      const renderValue = vi.fn((v: unknown): ReactNode => `<${String(v)}>`);
      const changed = entry({ kind: 'changed', path: 'c', before: 1, after: 2 });
      const added = entry({ kind: 'added', path: 'a', after: 3 });
      const removed = entry({ kind: 'removed', path: 'r', before: 4 });
      render(<ChangeSummary entries={[changed, added, removed]} renderValue={renderValue} />);
      expect(renderValue).toHaveBeenCalledTimes(4);
      expect(renderValue).toHaveBeenCalledWith(1, changed);
      expect(renderValue).toHaveBeenCalledWith(2, changed);
      expect(renderValue).toHaveBeenCalledWith(3, added);
      expect(renderValue).toHaveBeenCalledWith(4, removed);
      expect(renderValue).not.toHaveBeenCalledWith(undefined, expect.anything());
    });

    it('keeps the item (label and kind) when it returns null', () => {
      render(<ChangeSummary entries={[entry({ kind: 'added', after: 1 })]} renderValue={() => null} />);
      expect(readText(screen.getByRole('listitem'))).toBe('Amount, added, ');
    });

    it('can delegate to formatChangeValue for the other paths', () => {
      const renderValue = (v: unknown, e: ChangeEntry) =>
        e.path === 'amount' ? `EUR ${String(v)}` : formatChangeValue(v, common);
      const entries = [
        entry({ kind: 'changed', path: 'amount', before: 100, after: 120 }),
        entry({ kind: 'added', path: 'paid', label: 'Paid', after: true }),
      ];
      render(<ChangeSummary entries={entries} renderValue={renderValue} />);
      expect(screen.getAllByRole('listitem').map(readText)).toEqual([
        'Amount, changed, from EUR 100 to EUR 120',
        'Paid, added, Yes',
      ]);
    });

    it('a delegate with precise: true keeps the no-value states apart', () => {
      const entries = computeChangeSummary<Record<string, unknown>>({
        baseline: { a: null, b: undefined, c: '', d: null },
        values: { a: undefined, b: null, c: null },
      });
      render(<ChangeSummary entries={entries} renderValue={(v) => formatChangeValue(v, { ...common, precise: true })} />);
      expect(screen.getAllByRole('listitem').map(readText)).toEqual([
        'A, changed, from Null to Undefined',
        'B, changed, from Undefined to Null',
        'C, removed, ""',
        'D, changed, from Null to Undefined',
      ]);
    });

    it('a compact delegate reads the same on both sides of null against undefined', () => {
      const entries = computeChangeSummary<Record<string, unknown>>({ baseline: { a: null }, values: { a: undefined } });
      render(<ChangeSummary entries={entries} renderValue={(v) => formatChangeValue(v, common)} />);
      expect(readText(screen.getByRole('listitem'))).toBe('A, changed, from No value to No value');
    });

    it('cannot tell the side on undefined against a missing key: both calls get the same arguments', () => {
      const entries = computeChangeSummary<Record<string, unknown>>({ baseline: { a: undefined }, values: {} });
      const renderValue = vi.fn((v: unknown): ReactNode => formatChangeValue(v, { ...common, precise: true }));
      render(<ChangeSummary entries={entries} renderValue={renderValue} />);
      expect(renderValue.mock.calls).toEqual([
        [undefined, entries[0]],
        [undefined, entries[0]],
      ]);
      expect(readText(screen.getByRole('listitem'))).toBe('A, changed, from Undefined to Undefined');
    });

    it('propagates an exception thrown by renderValue', () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() =>
        render(
          <ChangeSummary
            entries={[entry({ kind: 'added', after: 1 })]}
            renderValue={() => {
              throw new Error('boom');
            }}
          />,
        ),
      ).toThrow('boom');
      errors.mockRestore();
    });
  });
});
