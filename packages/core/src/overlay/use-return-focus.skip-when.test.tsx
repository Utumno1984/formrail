import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useReturnFocus } from './use-return-focus';

afterEach(() => cleanup());
const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

function Host({ open, skipWhen }: { open: boolean; skipWhen?: () => boolean }) {
  useReturnFocus({ open, skipWhen });
  return (
    <>
      <button data-testid="opener">opener</button>
      <button data-testid="elsewhere">elsewhere</button>
    </>
  );
}

// `skipWhen` is opt-in (#76): a caller with a delayed return (an exit animation) tells the hook that
// another overlay may have taken the focus meanwhile. The default behaviour is covered, unchanged,
// in `use-return-focus.test.tsx`.
describe('useReturnFocus skipWhen', () => {
  const run = async (skipWhen?: () => boolean) => {
    const view = render(<Host open={false} skipWhen={skipWhen} />);
    const opener = view.getByTestId('opener');
    const elsewhere = view.getByTestId('elsewhere');
    act(() => opener.focus());
    view.rerender(<Host open skipWhen={skipWhen} />);
    act(() => elsewhere.focus());
    view.rerender(<Host open={false} skipWhen={skipWhen} />);
    await nextFrame();
    return { opener, elsewhere };
  };

  it('without it the focus is returned to the opener, as ever', async () => {
    const { opener } = await run();
    expect(document.activeElement).toBe(opener);
  });

  it('leaves the focus where it is when it answers true', async () => {
    const { elsewhere } = await run(() => true);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('returns the focus when it answers false', async () => {
    const { opener } = await run(() => false);
    expect(document.activeElement).toBe(opener);
  });
});
