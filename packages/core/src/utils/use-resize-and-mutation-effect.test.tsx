import { useRef } from 'react';
import { act, render } from '@testing-library/react';
import { useResizeAndMutationEffect } from './use-resize-and-mutation-effect';

type Notify = () => void;

/** A ResizeObserver that records its calls and lets the test fire its callback. */
function stubResizeObserver() {
  const calls: string[] = [];
  const notifiers: Notify[] = [];
  const label = (el: Element) => el.getAttribute('data-name') ?? el.tagName.toLowerCase();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: Notify) {
        notifiers.push(callback);
      }
      observe(el: Element) {
        calls.push(`observe ${label(el)}`);
      }
      unobserve(el: Element) {
        calls.push(`unobserve ${label(el)}`);
      }
      disconnect() {
        calls.push('disconnect');
      }
    },
  );
  return { calls, notify: () => act(() => notifiers.forEach((n) => n())) };
}

function Probe({
  items,
  children = false,
  enabled = true,
  update,
  cleanup,
}: {
  items: string[];
  children?: boolean;
  enabled?: boolean;
  update: () => void;
  cleanup?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useResizeAndMutationEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return undefined;
    return { target: el, children, update, cleanup };
  }, [enabled, children, update, cleanup]);
  return (
    <div ref={ref} data-name="box">
      {items.map((item) => (
        <span key={item} data-name={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useResizeAndMutationEffect', () => {
  it('runs `update` at the start and on every resize of the target; without children, only the target is observed', () => {
    const { calls, notify } = stubResizeObserver();
    const update = vi.fn();
    render(<Probe items={['a', 'b']} update={update} />);
    expect(update).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['observe box']);
    notify();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('with children: observes each child once; a mutation (un)observes only the nodes it added or removed', async () => {
    const { calls } = stubResizeObserver();
    const update = vi.fn();
    const { rerender } = render(<Probe items={['a', 'b', 'c']} children update={update} />);
    expect(calls).toEqual(['observe box', 'observe a', 'observe b', 'observe c']);
    calls.length = 0;
    update.mockClear();

    rerender(<Probe items={['a', 'b', 'c', 'd']} children update={update} />);
    await act(async () => {});
    expect(calls).toEqual(['observe d']);
    expect(update).toHaveBeenCalledTimes(1);
    calls.length = 0;

    rerender(<Probe items={['a', 'c', 'd']} children update={update} />);
    await act(async () => {});
    expect(calls).toEqual(['unobserve b']);
    expect(update).toHaveBeenCalledTimes(2);
    calls.length = 0;

    // A move inside the target (removed and re-inserted in one batch) keeps the observation as is.
    rerender(<Probe items={['d', 'a', 'c']} children update={update} />);
    await act(async () => {});
    expect(calls).toEqual([]);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('adding N children one at a time costs N observations in total, not O(N²)', async () => {
    const { calls } = stubResizeObserver();
    const update = vi.fn();
    const items: string[] = [];
    const { rerender } = render(<Probe items={items} children update={update} />);
    for (let i = 0; i < 50; i += 1) {
      items.push(`t${i}`);
      rerender(<Probe items={[...items]} children update={update} />);
      await act(async () => {});
    }
    expect(calls.filter((c) => c.startsWith('observe'))).toHaveLength(51);
    expect(calls).not.toContain('disconnect');
  });

  it('a change of dependencies or an unmount disconnects and runs `cleanup`; nothing is observed when setup returns nothing', () => {
    const { calls } = stubResizeObserver();
    const update = vi.fn();
    const cleanup = vi.fn();
    const { rerender, unmount } = render(<Probe items={['a']} update={update} cleanup={cleanup} />);
    rerender(<Probe items={['a']} enabled={false} update={update} cleanup={cleanup} />);
    expect(calls).toEqual(['observe box', 'disconnect']);
    expect(cleanup).toHaveBeenCalledTimes(1);
    rerender(<Probe items={['a']} update={update} cleanup={cleanup} />);
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['observe box', 'disconnect', 'observe box', 'disconnect']);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('without ResizeObserver: `update` still runs at the start and on child mutations', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const update = vi.fn();
    const { rerender } = render(<Probe items={['a']} children update={update} />);
    expect(update).toHaveBeenCalledTimes(1);
    rerender(<Probe items={['a', 'b']} children update={update} />);
    await act(async () => {});
    expect(update).toHaveBeenCalledTimes(2);
  });
});
