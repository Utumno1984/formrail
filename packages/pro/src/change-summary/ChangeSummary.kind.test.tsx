import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChangeSummary } from './ChangeSummary';
import type { ChangeEntry, ChangeKind } from './types';

afterEach(cleanup);

/** Text a screen reader gets: aria-hidden excluded. */
function readText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return '';
  return Array.from(node.childNodes).map(readText).join('');
}

const entry = (kind: ChangeKind, label: string): ChangeEntry => ({
  kind,
  path: label,
  label,
  labelPath: [label],
  before: kind === 'added' ? undefined : 'a',
  after: kind === 'removed' ? undefined : 'b',
  beforeMissing: kind === 'added',
  afterMissing: kind === 'removed',
});

const three = [entry('added', 'Note'), entry('removed', 'Memo'), entry('changed', 'Amount')];

/** The badge of an item: the visible kind text span. */
const badge = (item: HTMLElement) => item.querySelector('[class*="__kind"]') as HTMLElement;

describe('ChangeSummary kind badges (#485)', () => {
  it('shows the kind as visible text with its own class, so the three differ without colour', () => {
    render(<ChangeSummary entries={three} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => badge(li).textContent)).toEqual(['added', 'removed', 'changed']);
    expect(items.map((li) => badge(li).className)).toEqual([
      'rop-pro-change-summary__kind rop-pro-change-summary__kind--added',
      'rop-pro-change-summary__kind rop-pro-change-summary__kind--removed',
      'rop-pro-change-summary__kind rop-pro-change-summary__kind--changed',
    ]);
    for (const li of items) expect(badge(li)).toBeVisible();
  });

  it('adds no node for the icon (a CSS shape: nothing for assistive technology to read)', () => {
    render(<ChangeSummary entries={three} />);
    for (const li of screen.getAllByRole('listitem')) {
      expect(badge(li).children).toHaveLength(0);
      expect(within(li).queryByRole('img')).toBeNull();
      expect(li.querySelector('svg')).toBeNull();
    }
  });

  it('keeps the accessible name of the row', () => {
    render(<ChangeSummary entries={[{ ...entry('changed', 'Amount'), before: 100, after: 120 }]} />);
    expect(readText(screen.getByRole('listitem'))).toBe('Amount, changed, from 100 to 120');
  });

  it('shows custom valueLabels as given; the class (so the shape) stays that of the kind', () => {
    render(<ChangeSummary entries={three} valueLabels={{ added: 'new', removed: 'gone', changed: 'edited' }} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => badge(li).textContent)).toEqual(['new', 'gone', 'edited']);
    expect(badge(items[0]!)).toHaveClass('rop-pro-change-summary__kind--added');
    expect(badge(items[1]!)).toHaveClass('rop-pro-change-summary__kind--removed');
    expect(badge(items[2]!)).toHaveClass('rop-pro-change-summary__kind--changed');
  });

  it.each([
    ['an empty string', ''],
    ['a blank string', '   '],
  ])('a kind text that is %s falls back to the default text: no icon without a name', (_name, blank) => {
    render(<ChangeSummary entries={three} valueLabels={{ added: blank, removed: blank, changed: blank }} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => badge(li).textContent)).toEqual(['added', 'removed', 'changed']);
    expect(items[0]).toHaveTextContent('Note, added,');
  });

  it('only the blank kind falls back; a text given for another kind is kept', () => {
    render(<ChangeSummary entries={three} valueLabels={{ added: '', removed: 'gone' }} />);
    expect(screen.getAllByRole('listitem').map((li) => badge(li).textContent)).toEqual(['added', 'gone', 'changed']);
  });

  it('a very long text stays in one badge element', () => {
    const long = 'x'.repeat(200);
    render(<ChangeSummary entries={[entry('added', 'Note')]} valueLabels={{ added: long }} />);
    expect(badge(screen.getByRole('listitem'))).toHaveTextContent(long);
  });

  it('a custom renderValue does not change the badge', () => {
    const { rerender } = render(<ChangeSummary entries={three} />);
    const before = screen.getAllByRole('listitem').map((li) => badge(li).outerHTML);
    rerender(<ChangeSummary entries={three} renderValue={(v) => <b>{String(v)}</b>} />);
    expect(screen.getAllByRole('listitem').map((li) => badge(li).outerHTML)).toEqual(before);
  });
});
