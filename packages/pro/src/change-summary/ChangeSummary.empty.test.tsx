import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChangeSummary } from './ChangeSummary';
import type { ChangeEntry } from './types';

afterEach(cleanup);

const one: ChangeEntry = {
  path: 'amount',
  label: 'Amount',
  labelPath: ['Amount'],
  before: 1,
  after: 2,
  beforeMissing: false,
  afterMissing: false,
  kind: 'changed',
};

describe('ChangeSummary: explicit empty state (#484)', () => {
  it('shows the text next to an aria-hidden icon', () => {
    const { container } = render(<ChangeSummary entries={[]} />);
    expect(screen.getByText('No changes')).toBeVisible();
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('is a group named by `label` (default Changes) that contains the text', () => {
    const { rerender } = render(<ChangeSummary entries={[]} />);
    expect(screen.getByRole('group', { name: 'Changes' })).toHaveTextContent('No changes');
    rerender(<ChangeSummary entries={[]} label="Pending edits" emptyLabel="Nothing to save" />);
    expect(screen.getByRole('group', { name: 'Pending edits' })).toHaveTextContent('Nothing to save');
  });

  it('has no live region, status or alert in the empty state', () => {
    const { container } = render(<ChangeSummary entries={[]} />);
    expect(container.querySelector('[aria-live],[role="status"],[role="alert"],[aria-atomic]')).toBeNull();
  });

  it('declares the minimum-height class on the box only while empty, and it is not a skeleton', () => {
    const { container, rerender } = render(<ChangeSummary entries={[]} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('rop-pro-change-summary--empty');
    expect(container.querySelector('[class*="skeleton"],[aria-busy]')).toBeNull();
    rerender(<ChangeSummary entries={[one]} />);
    expect(root).not.toHaveClass('rop-pro-change-summary--empty');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it.each([
    ['an empty string', ''],
    ['a blank string', '   '],
    ['undefined', undefined],
  ])('emptyLabel as %s gives the default text (no empty block)', (_name, emptyLabel) => {
    render(<ChangeSummary entries={[]} emptyLabel={emptyLabel} />);
    expect(screen.getByRole('group', { name: 'Changes' })).toHaveTextContent(/^No changes$/);
  });

  it('keeps a non-blank emptyLabel as given, and a consumer className on the box', () => {
    const { container } = render(<ChangeSummary entries={[]} emptyLabel=" Nothing " className="p-0" />);
    expect(screen.getByRole('group').textContent).toBe(' Nothing ');
    expect(container.firstElementChild).toHaveClass('rop-pro-change-summary', 'p-0');
  });
});
