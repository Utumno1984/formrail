import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Divider } from './Divider';

describe('Divider', () => {
  it('renders an <hr> by default (implicit separator role, no explicit role)', () => {
    render(<Divider data-testid="d" />);
    const d = screen.getByTestId('d');
    expect(d.tagName).toBe('HR');
    expect(screen.getByRole('separator')).toBe(d);
    expect(d).not.toHaveAttribute('role');
    expect(d).not.toHaveAttribute('aria-hidden');
    expect(d).not.toHaveAttribute('aria-orientation');
  });

  it('vertical: role="separator" with aria-orientation="vertical" on a <div>', () => {
    render(<Divider orientation="vertical" data-testid="d" />);
    const d = screen.getByRole('separator');
    expect(d.tagName).toBe('DIV');
    expect(d).toHaveAttribute('aria-orientation', 'vertical');
    expect(d).toHaveClass('self-stretch', 'w-0', 'border-s');
  });

  it.each(['horizontal', 'vertical'] as const)('decorative (%s): <div>, no role, aria-hidden, not in the a11y tree', (o) => {
    const { container } = render(<Divider orientation={o} decorative />);
    const d = container.firstElementChild as HTMLElement;
    expect(d.tagName).toBe('DIV');
    expect(d).toHaveAttribute('aria-hidden', 'true');
    expect(d).not.toHaveAttribute('role');
    expect(d).not.toHaveAttribute('aria-orientation');
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('draws the line as a 1px border in the border token (not a background), resetting the hr defaults', () => {
    render(<Divider />);
    const cls = screen.getByRole('separator').className;
    for (const c of ['h-0', 'border-0', 'border-bs', 'border-solid', 'border-rop-border', 'box-content', 'p-0', 'w-full']) {
      expect(cls).toContain(c);
    }
    expect(cls).not.toMatch(/(^|\s)bg-/);
  });

  it.each([
    ['none', 'my-0'],
    ['sm', 'my-2'],
    ['md', 'my-4'],
    ['lg', 'my-6'],
  ] as const)('horizontal spacing=%s -> %s (default md)', (spacing, cls) => {
    render(<Divider spacing={spacing} />);
    expect(screen.getByRole('separator')).toHaveClass(cls);
  });

  it.each([
    ['none', 'mx-0'],
    ['sm', 'mx-2'],
    ['md', 'mx-4'],
    ['lg', 'mx-6'],
  ] as const)('vertical spacing=%s -> %s', (spacing, cls) => {
    render(<Divider orientation="vertical" spacing={spacing} />);
    expect(screen.getByRole('separator')).toHaveClass(cls);
  });

  it('default spacing is md on both orientations', () => {
    const { unmount } = render(<Divider />);
    expect(screen.getByRole('separator')).toHaveClass('my-4');
    unmount();
    render(<Divider orientation="vertical" />);
    expect(screen.getByRole('separator')).toHaveClass('mx-4');
  });

  it('uses logical properties only (no physical margin/border/padding utilities)', () => {
    for (const props of [{}, { orientation: 'vertical' as const }]) {
      const { container, unmount } = render(<Divider {...props} spacing="lg" />);
      expect((container.firstElementChild as HTMLElement).className).not.toMatch(
        /(^|\s)(m[lrtb]|p[lrtb]|border-[lrtb]|left|right)(-|\s|$)/,
      );
      unmount();
    }
  });

  it('is not focusable and has no tabindex', () => {
    render(<Divider orientation="vertical" />);
    const d = screen.getByRole('separator');
    expect(d).not.toHaveAttribute('tabindex');
    d.focus();
    expect(d).not.toHaveFocus();
  });

  it('className wins over conflicting classes (real merge), ref is forwarded, other props pass through', () => {
    const ref = createRef<HTMLElement>();
    render(<Divider ref={ref} className="my-10 border-bs-4" data-testid="d" id="x" />);
    const d = screen.getByTestId('d');
    expect(ref.current).toBe(d);
    expect(d).toHaveClass('my-10', 'border-bs-4');
    expect(d).not.toHaveClass('border-bs');
    expect(d).not.toHaveClass('my-4');
    expect(d).toHaveAttribute('id', 'x');
  });

  it('ref is forwarded in the vertical and decorative variants', () => {
    const a = createRef<HTMLElement>();
    const b = createRef<HTMLElement>();
    render(
      <>
        <Divider ref={a} orientation="vertical" data-testid="a" />
        <Divider ref={b} decorative data-testid="b" />
      </>,
    );
    expect(a.current).toBe(screen.getByTestId('a'));
    expect(b.current).toBe(screen.getByTestId('b'));
  });

  it('does not leak non-DOM props as attributes', () => {
    const { container } = render(
      <>
        <Divider orientation="vertical" decorative spacing="lg" />
        <Divider orientation="vertical" spacing="sm" />
        <Divider orientation="horizontal" decorative spacing="none" />
        <Divider spacing="lg" />
      </>,
    );
    for (const el of Array.from(container.children)) {
      for (const name of ['orientation', 'decorative', 'spacing']) expect(el).not.toHaveAttribute(name);
    }
    expect(container.querySelectorAll('[aria-orientation]')).toHaveLength(1);
  });
});
