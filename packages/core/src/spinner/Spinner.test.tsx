import { createRef, StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { Spinner, type SpinnerProps } from './Spinner';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const nextFrame = () => act(() => void vi.advanceTimersByTime(20));

describe('Spinner announced mode', () => {
  it('mounts an empty status region and fills the SAME node on the next frame', () => {
    render(<Spinner />);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('');
    nextFrame();
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Loading');
  });

  it('does not rewrite the text on a re-render with the same label', () => {
    const { rerender } = render(<Spinner label="Loading" />);
    nextFrame();
    const region = screen.getByRole('status');
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(region, { subtree: true, childList: true, characterData: true, attributes: true });
    rerender(<Spinner label="Loading" />);
    rerender(<Spinner label="Loading" />);
    nextFrame();
    records.push(...observer.takeRecords());
    expect(records).toHaveLength(0);
  });

  it('a label change updates the text once', () => {
    const { rerender } = render(<Spinner label="Loading" />);
    nextFrame();
    const region = screen.getByRole('status');
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(region, { subtree: true, childList: true, characterData: true });
    rerender(<Spinner label="Saving" />);
    nextFrame();
    records.push(...observer.takeRecords());
    expect(region).toHaveTextContent('Saving');
    expect(records.length).toBeGreaterThan(0);
    const after = records.length;
    rerender(<Spinner label="Saving" />);
    nextFrame();
    expect(observer.takeRecords()).toHaveLength(0);
    expect(after).toBe(records.length);
  });

  it('a label change BEFORE the frame writes only the new text, once (the stale frame is cancelled)', () => {
    const { container, rerender } = render(<Spinner label="A" />);
    const region = container.firstElementChild!;
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(region, { subtree: true, childList: true, characterData: true });
    rerender(<Spinner label="B" />);
    nextFrame();
    records.push(...observer.takeRecords());
    expect(region).toHaveTextContent('B');
    const written = records.flatMap((r) => Array.from(r.addedNodes).map((n) => n.textContent));
    expect(written).toEqual(['B']);
  });

  it('a label change after the first frame produces exactly one text write', () => {
    const { container, rerender } = render(<Spinner label="A" />);
    nextFrame();
    const region = container.firstElementChild!;
    const observer = new MutationObserver(() => {});
    observer.observe(region, { subtree: true, childList: true, characterData: true });
    rerender(<Spinner label="B" />);
    nextFrame();
    const records = observer.takeRecords();
    expect(records.filter((r) => r.addedNodes.length > 0)).toHaveLength(1);
    expect(region).toHaveTextContent('B');
  });

  it('StrictMode writes the text exactly once', () => {
    const { container } = render(
      <StrictMode>
        <Spinner />
      </StrictMode>,
    );
    const region = container.firstElementChild!;
    const observer = new MutationObserver(() => {});
    observer.observe(region, { subtree: true, childList: true, characterData: true });
    nextFrame();
    expect(observer.takeRecords().filter((r) => r.addedNodes.length > 0)).toHaveLength(1);
  });

  it('switching from decorative to announced creates the region and writes the text', () => {
    const { container, rerender } = render(<Spinner decorative />);
    nextFrame();
    rerender(<Spinner />);
    expect(container.firstElementChild).toHaveAttribute('role', 'status');
    expect(container.firstElementChild).toHaveTextContent('');
    nextFrame();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('changing the label to empty clears the region and logs the error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<Spinner label="Loading" />);
    nextFrame();
    rerender(<Spinner label="" />);
    nextFrame();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('user-supplied aria-hidden / role / aria-live cannot break the status semantics', () => {
    const props = { 'aria-hidden': true, role: 'presentation', 'aria-live': 'off', 'aria-atomic': false } as SpinnerProps;
    render(<Spinner {...props} />);
    const region = screen.getByRole('status');
    expect(region).not.toHaveAttribute('aria-hidden');
    expect(region).not.toHaveAttribute('aria-live');
    expect(region).not.toHaveAttribute('aria-atomic');
  });

  it('decorative ignores a user-supplied role', () => {
    const { container } = render(<Spinner decorative {...({ role: 'status' } as SpinnerProps)} />);
    expect(container.firstElementChild).not.toHaveAttribute('role');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('unmounting before the frame throws nothing and writes nothing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, unmount } = render(<Spinner />);
    const region = container.firstElementChild!;
    unmount();
    nextFrame();
    expect(region).toHaveTextContent('');
    expect(error).not.toHaveBeenCalled();
  });

  it('two spinners have their own region', () => {
    render(
      <>
        <Spinner label="Loading A" />
        <Spinner label="Loading B" />
      </>,
    );
    nextFrame();
    const regions = screen.getAllByRole('status');
    expect(regions).toHaveLength(2);
    expect(regions[0]).toHaveTextContent('Loading A');
    expect(regions[1]).toHaveTextContent('Loading B');
  });

  it('works under StrictMode (effect run twice)', () => {
    render(
      <StrictMode>
        <Spinner />
      </StrictMode>,
    );
    nextFrame();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('an empty label leaves the region empty and logs an error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Spinner label="" />);
    nextFrame();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('<Spinner> has an empty label'));
  });

  it.each([['spaces', '   '], ['tabs/newlines', ' \t\n '], ['null (JS consumer)', null]])(
    'a %s label behaves like an empty one: dev error, empty region',
    (_name, value) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<Spinner label={value as unknown as string} />);
      nextFrame();
      expect(screen.getByRole('status').textContent).toBe('');
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('<Spinner> has an empty label'));
    },
  );

  it('SSR renders the empty region', () => {
    const html = renderToString(<Spinner />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('Loading');
  });
});

describe('Spinner decorative mode', () => {
  it('is aria-hidden with no role and no text, even after a frame', () => {
    const { container } = render(<Spinner decorative />);
    nextFrame();
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).not.toHaveAttribute('role');
    expect(root.textContent).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('switching to decorative removes the role and the text', () => {
    const { container, rerender } = render(<Spinner />);
    nextFrame();
    rerender(<Spinner decorative />);
    nextFrame();
    expect(container.firstElementChild).not.toHaveAttribute('role');
    expect(container.textContent).toBe('');
  });
});

describe('Spinner props', () => {
  it.each([
    ['xs', 'size-(--icon-rop-xs)'],
    ['sm', 'size-(--icon-rop-sm)'],
    ['md', 'size-(--icon-rop-md)'],
    ['lg', 'size-(--icon-rop-lg)'],
    ['xl', 'size-(--icon-rop-xl)'],
  ] as const)('size %s uses its icon token', (size, cls) => {
    const { container } = render(<Spinner size={size} />);
    expect(container.firstElementChild).toHaveClass(cls);
  });

  it('defaults to md', () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild).toHaveClass('size-(--icon-rop-md)');
  });

  it('uses currentColor and animates only under motion-safe', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg')!;
    expect(svg.innerHTML).toContain('currentColor');
    expect(svg).toHaveClass('motion-safe:animate-rop-spinner');
    expect(svg).not.toHaveClass('animate-rop-spinner');
  });

  it('does not leak size/label/decorative to the DOM; className wins; ref is forwarded', () => {
    const ref = createRef<HTMLSpanElement>();
    const { container } = render(<Spinner ref={ref} size="lg" label="Wait" className="size-10 text-red-500" data-x="1" />);
    const root = container.firstElementChild!;
    expect(ref.current).toBe(root);
    for (const a of ['size', 'label', 'decorative']) expect(root).not.toHaveAttribute(a);
    expect(root).toHaveAttribute('data-x', '1');
    expect(root).toHaveClass('size-10', 'text-red-500');
    expect(root).not.toHaveClass('size-(--icon-rop-lg)');
  });
});
