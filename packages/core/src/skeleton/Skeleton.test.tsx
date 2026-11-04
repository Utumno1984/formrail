import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './Skeleton';

/** Class names of every line of a text skeleton. */
const lineOf = (el: HTMLElement): string[] =>
  Array.from(el.querySelectorAll('[data-rop-skeleton-line]'), (l) => l.className);

describe('Skeleton', () => {
  it('is always aria-hidden, with no role and not focusable, whatever the variant', () => {
    for (const variant of ['text', 'rect', 'circle'] as const) {
      const { unmount } = render(<Skeleton variant={variant} data-testid="s" />);
      const el = screen.getByTestId('s');
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el).not.toHaveAttribute('role');
      expect(el.tabIndex).toBe(-1); // not focusable (no tabindex attribute: a plain div)
      expect(el.querySelectorAll('[tabindex], a, button, input')).toHaveLength(0);
      unmount();
    }
  });

  it('aria-hidden cannot be overridden through props', () => {
    render(<Skeleton data-testid="s" aria-hidden={false} />);
    expect(screen.getByTestId('s')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is not a tab stop by itself', () => {
    render(<Skeleton data-testid="s" />);
    expect(screen.getByTestId('s')).not.toHaveAttribute('tabindex');
  });

  it('text: default one line of the body line height token', () => {
    render(<Skeleton data-testid="s" />);
    const lines = lineOf(screen.getByTestId('s'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('h-[var(--text-rop-body--line-height)]');
  });

  it.each(['body', 'caption', 'label', 'title-sm', 'title-md', 'title-lg'] as const)(
    'text: textVariant %s takes its own line-height token',
    (v) => {
      render(<Skeleton data-testid="s" textVariant={v} />);
      expect(lineOf(screen.getByTestId('s'))[0]).toContain(`h-[var(--text-rop-${v}--line-height)]`);
    },
  );

  it('text: N lines, only the last one is shorter', () => {
    render(<Skeleton data-testid="s" lines={3} />);
    const lines = lineOf(screen.getByTestId('s'));
    expect(lines).toHaveLength(3);
    expect(lines[0]).not.toContain('w-3/5');
    expect(lines[1]).not.toContain('w-3/5');
    expect(lines[2]).toContain('w-3/5');
  });

  it('text: a single line is not shortened', () => {
    render(<Skeleton data-testid="s" lines={1} />);
    expect(lineOf(screen.getByTestId('s'))[0]).not.toContain('w-3/5');
  });

  it.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY])('lines=%s renders nothing and does not crash', (n) => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<Skeleton lines={n} ref={ref} />);
    expect(container).toBeEmptyDOMElement();
    expect(ref.current).toBeNull();
  });

  it('lines is rounded down', () => {
    render(<Skeleton data-testid="s" lines={2.9} />);
    expect(lineOf(screen.getByTestId('s'))).toHaveLength(2);
  });

  it('rect: number width/height are px, strings are passed through, defaults apply', () => {
    render(<Skeleton variant="rect" data-testid="a" width={120} height="3rem" />);
    expect(screen.getByTestId('a').style.width).toBe('120px');
    expect(screen.getByTestId('a').style.height).toBe('3rem');
    render(<Skeleton variant="rect" data-testid="b" />);
    expect(screen.getByTestId('b').style.width).toBe('100%');
    expect(screen.getByTestId('b').style.height).toBe('4rem');
  });

  it('circle: a single side is the diameter', () => {
    render(<Skeleton variant="circle" data-testid="a" width={32} />);
    expect(screen.getByTestId('a')).toHaveStyle({ width: '32px', height: '32px' });
    render(<Skeleton variant="circle" data-testid="b" height="2rem" />);
    expect(screen.getByTestId('b').style.width).toBe('2rem');
    expect(screen.getByTestId('b').style.height).toBe('2rem');
    render(<Skeleton variant="circle" data-testid="c" />);
    expect(screen.getByTestId('c')).toHaveStyle({ width: '40px', height: '40px' });
  });

  it('a percentage width gets a real minimum width', () => {
    render(<Skeleton variant="rect" data-testid="a" width="50%" />);
    expect(screen.getByTestId('a').style.minWidth).toBe('1rem');
    render(<Skeleton variant="rect" data-testid="b" width={8} />);
    expect(screen.getByTestId('b').style.minWidth).toBe('');
  });

  it('text: full width with a real max-width by default', () => {
    render(<Skeleton data-testid="s" />);
    expect(screen.getByTestId('s').className).toContain('max-w-full');
    expect(screen.getByTestId('s').className).toContain('w-full');
  });

  it('uses motion-safe pulse only and existing colour tokens', () => {
    const { container } = render(<Skeleton variant="rect" />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain('motion-safe:animate-rop-skeleton-pulse');
    expect(cls).not.toMatch(/(^|\s)animate-/);
    expect(cls).toContain('bg-rop-border');
  });

  it('does not leak non-DOM props to the DOM', () => {
    const { container } = render(<Skeleton variant="text" textVariant="caption" lines={2} />);
    const attrs = [...container.querySelectorAll('*')].flatMap((e) => e.getAttributeNames());
    for (const bad of ['variant', 'textvariant', 'textVariant', 'lines']) expect(attrs).not.toContain(bad);
  });

  it('className wins over the base classes via cn (real merge)', () => {
    render(<Skeleton variant="rect" data-testid="s" className="rounded-full bg-red-500" />);
    const cls = screen.getByTestId('s').className;
    expect(cls).toContain('rounded-full');
    expect(cls).not.toContain('rounded-[4px]');
    expect(cls).toContain('bg-red-500');
    expect(cls).not.toContain('bg-rop-border');
  });

  it('forwards the ref (every variant) and extra attributes', () => {
    for (const variant of ['text', 'rect', 'circle'] as const) {
      const ref = createRef<HTMLDivElement>();
      render(<Skeleton variant={variant} ref={ref} data-x="1" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current).toHaveAttribute('data-x', '1');
    }
  });

  it('SSR: renderToString works for every variant', () => {
    for (const variant of ['text', 'rect', 'circle'] as const) {
      expect(() => renderToString(<Skeleton variant={variant} lines={2} />)).not.toThrow();
    }
    expect(renderToString(<Skeleton />)).toContain('aria-hidden="true"');
  });

  it.each(['body', 'caption', 'label', 'title-sm', 'title-md', 'title-lg'] as const)(
    'text: the bar of textVariant %s scales with that step font size',
    (v) => {
      const { container } = render(<Skeleton textVariant={v} />);
      const bar = container.querySelector('[data-rop-skeleton-line] > div') as HTMLElement;
      expect(bar.className.split(' ')).toContain(`text-rop-${v}`);
      expect(bar.className).toContain('h-[0.7em]');
    },
  );

  it('text: barClassName restyles the bars (colour, radius) with a real merge', () => {
    const { container } = render(<Skeleton lines={2} barClassName="bg-red-500 rounded-full" />);
    const bars = container.querySelectorAll<HTMLElement>('[data-rop-skeleton-line] > div');
    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      expect(bar.className).toContain('bg-red-500');
      expect(bar.className).not.toContain('bg-rop-border');
      expect(bar.className).toContain('rounded-full');
      expect(bar.className).not.toContain('rounded-[2px]');
    }
  });

  it('does not leak barClassName to the DOM', () => {
    const { container } = render(<Skeleton barClassName="x" />);
    const attrs = [...container.querySelectorAll('*')].flatMap((e) => e.getAttributeNames());
    expect(attrs).not.toContain('barclassname');
    expect(attrs).not.toContain('barClassName');
  });

  it('text: consumer style.width / minWidth survive when no width prop is passed', () => {
    render(<Skeleton data-testid="s" style={{ width: '50%', minWidth: '5rem' }} />);
    expect(screen.getByTestId('s').style.width).toBe('50%');
    expect(screen.getByTestId('s').style.minWidth).toBe('5rem');
  });

  it('text: the width prop wins over style.width', () => {
    render(<Skeleton data-testid="s" width={100} style={{ width: '50%' }} />);
    expect(screen.getByTestId('s').style.width).toBe('100px');
  });

  it('rect: consumer style width/height survive when props are missing, props win otherwise', () => {
    render(<Skeleton variant="rect" data-testid="a" style={{ width: 30, height: 20 }} />);
    expect(screen.getByTestId('a')).toHaveStyle({ width: '30px', height: '20px' });
    render(<Skeleton variant="rect" data-testid="b" width={10} height={12} style={{ width: 30, height: 20 }} />);
    expect(screen.getByTestId('b')).toHaveStyle({ width: '10px', height: '12px' });
  });

  it('circle: consumer style size survives when props are missing', () => {
    render(<Skeleton variant="circle" data-testid="a" style={{ width: 18, height: 18 }} />);
    expect(screen.getByTestId('a')).toHaveStyle({ width: '18px', height: '18px' });
  });

  it('circle: a percentage size derives its height from aspect-ratio (no % height)', () => {
    render(<Skeleton variant="circle" data-testid="a" width="50%" />);
    const el = screen.getByTestId('a');
    expect(el.className).toContain('aspect-square');
    expect(el.style.width).toBe('50%');
    expect(el.style.height).toBe('auto');
    expect(el.style.minWidth).toBe('1rem');
  });

  it('forced-colors keeps a visible contour', () => {
    const { container } = render(<Skeleton variant="rect" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('forced-colors:');
  });
});
