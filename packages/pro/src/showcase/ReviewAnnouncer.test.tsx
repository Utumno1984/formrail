// #583: the contract of `ReviewAnnouncer`, on its own: a polite `status` mounted empty that says a text once, each
// time the text changes, and never writes again for the same text.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReviewAnnouncer } from './record-integrity';

/** Every write into the region (a screen reader reads the region again at each of them). */
function watch(region: HTMLElement) {
  const writes: string[] = [];
  const observer = new MutationObserver(() => writes.push(region.textContent ?? ''));
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  return { writes, stop: () => observer.disconnect() };
}

describe('ReviewAnnouncer (#583)', () => {
  it('mounted: empty, the opening text is not announced', () => {
    const { getByRole } = render(<ReviewAnnouncer text="A" />);
    expect(getByRole('status')).toHaveTextContent('');
  });

  it('A, B, A: the return to the opening text is announced again', () => {
    const { rerender, getByRole } = render(<ReviewAnnouncer text="A" />);
    const region = getByRole('status');
    expect(region).toHaveTextContent('');
    rerender(<ReviewAnnouncer text="B" />);
    expect(region).toHaveTextContent('B');
    rerender(<ReviewAnnouncer text="A" />);
    expect(region).toHaveTextContent('A');
  });

  it('A, B, B: the same text is neither rewritten nor announced twice', async () => {
    const { rerender, getByRole } = render(<ReviewAnnouncer text="A" />);
    const region = getByRole('status');
    rerender(<ReviewAnnouncer text="B" />);
    const { writes, stop } = watch(region);
    rerender(<ReviewAnnouncer text="B" />);
    rerender(<ReviewAnnouncer text="B" />);
    // MutationObserver callbacks are microtasks: let them run.
    await Promise.resolve();
    stop();
    expect(region).toHaveTextContent('B');
    expect(writes).toEqual([]);
  });

  it('A, A: nothing is announced when the text never changes', async () => {
    const { rerender, getByRole } = render(<ReviewAnnouncer text="A" />);
    const region = getByRole('status');
    const { writes, stop } = watch(region);
    rerender(<ReviewAnnouncer text="A" />);
    await Promise.resolve();
    stop();
    expect(region).toHaveTextContent('');
    expect(writes).toEqual([]);
  });
});
