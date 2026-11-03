import { cleanup, render, screen } from '@testing-library/react';
import { createRef, forwardRef, type AnchorHTMLAttributes } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage } from './Breadcrumb';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

const Basic = (props: Parameters<typeof Breadcrumb>[0] = {}) => (
  <Breadcrumb {...props}>
    <BreadcrumbItem>
      <BreadcrumbLink href="/">Home</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbItem>
      <BreadcrumbLink href="/invoices">Invoices</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbItem>
      <BreadcrumbPage>2026-0142</BreadcrumbPage>
    </BreadcrumbItem>
  </Breadcrumb>
);

describe('Breadcrumb', () => {
  it('is a navigation landmark named "Breadcrumb" with an ordered list of items', () => {
    render(<Basic />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.querySelector('ol')).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('the label is configurable', () => {
    render(<Basic aria-label="Percorso" />);
    expect(screen.getByRole('navigation', { name: 'Percorso' })).toBeTruthy();
  });

  it('separators are aria-hidden and not extra list items; links are the only tab stops', () => {
    const { container } = render(<Basic />);
    const seps = container.querySelectorAll('[data-rop-breadcrumb-separator]');
    expect(seps).toHaveLength(3); // one per item, the first hidden by CSS (group-first/item:hidden)
    seps.forEach((s) => expect(s.getAttribute('aria-hidden')).toBe('true'));
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Home', 'Invoices']);
    expect(container.querySelector('li:first-child [data-rop-breadcrumb-separator]')?.className).toContain(
      'group-first/item:hidden',
    );
  });

  it('a single item (current page only) renders no link and a hidden-first separator', () => {
    render(
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbPage>Only</BreadcrumbPage>
        </BreadcrumbItem>
      </Breadcrumb>,
    );
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('Only').getAttribute('aria-current')).toBe('page');
  });

  it('the slash separator renders text, the chevron an svg; both decorative', () => {
    const { container, rerender } = render(<Basic separator="slash" />);
    expect(container.querySelector('[data-rop-breadcrumb-separator]')?.textContent).toBe('/');
    rerender(<Basic separator="chevron" />);
    expect(container.querySelector('[data-rop-breadcrumb-separator] svg')).not.toBeNull();
    expect(container.querySelector('[data-rop-breadcrumb-separator]')?.textContent).toBe('');
  });

  it('className wins over the defaults (cn) and the ref is forwarded', () => {
    const ref = createRef<HTMLElement>();
    render(<Basic className="max-w-[10px]" ref={ref} />);
    expect(ref.current).toBe(screen.getByRole('navigation'));
    expect(ref.current!.className).toContain('max-w-[10px]');
    expect(ref.current!.className).not.toContain('max-w-full');
  });

  it('does not leak non-DOM props: no unknown attribute reaches the DOM', () => {
    const { container } = render(<Basic separator="slash" />);
    const nav = container.querySelector('nav')!;
    expect(nav.getAttributeNames().sort()).toEqual(['aria-label', 'class']);
  });
});

describe('BreadcrumbPage', () => {
  it('is non-interactive text with aria-current="page": no href, no tabindex, no link role', () => {
    render(<Basic />);
    const page = screen.getByText('2026-0142');
    expect(page.getAttribute('aria-current')).toBe('page');
    expect(page.hasAttribute('href')).toBe(false);
    expect(page.hasAttribute('tabindex')).toBe(false);
    expect(screen.queryByRole('link', { name: '2026-0142' })).toBeNull();
  });

  it('aria-current moves with the current item after a rerender', () => {
    const view = (current: 'a' | 'b') => (
      <Breadcrumb>
        <BreadcrumbItem>{current === 'a' ? <BreadcrumbPage>A</BreadcrumbPage> : <BreadcrumbLink href="/a">A</BreadcrumbLink>}</BreadcrumbItem>
        <BreadcrumbItem>{current === 'b' ? <BreadcrumbPage>B</BreadcrumbPage> : <BreadcrumbLink href="/b">B</BreadcrumbLink>}</BreadcrumbItem>
      </Breadcrumb>
    );
    const { rerender, container } = render(view('a'));
    expect(container.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(screen.getByText('A').getAttribute('aria-current')).toBe('page');
    rerender(view('b'));
    expect(container.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(screen.getByText('B').getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('forwards ref and className', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbPage ref={ref} className="text-red-500">
            X
          </BreadcrumbPage>
        </BreadcrumbItem>
      </Breadcrumb>,
    );
    expect(ref.current).toBe(screen.getByText('X'));
    expect(ref.current!.className).toContain('text-red-500');
    expect(ref.current!.className).not.toContain('text-rop-text ');
  });
});

describe('BreadcrumbLink', () => {
  it('renders an <a> with the href; the truncated text sits inside it and the name is the full text', () => {
    render(<Basic />);
    const link = screen.getByRole('link', { name: 'Invoices' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/invoices');
    expect(link.firstElementChild?.className).toContain('overflow-hidden');
    expect(link.className).not.toContain('overflow-hidden');
  });

  it('keeps the accessible name for non-text content (icon + visually hidden text)', () => {
    render(
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">
            <svg aria-hidden="true" />
            <span className="sr-only">Home</span>
          </BreadcrumbLink>
        </BreadcrumbItem>
      </Breadcrumb>,
    );
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
  });

  it('asChild gives classes, aria-* and ref to the child; no nested anchor', () => {
    const Router = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }>(
      function Router({ to, children, ...rest }, ref) {
        return (
          <a {...rest} ref={ref} href={`#${to}`} data-router="">
            {children}
          </a>
        );
      },
    );
    const ref = createRef<HTMLAnchorElement>();
    const { container } = render(
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbLink asChild ref={ref} aria-describedby="d" className="custom">
            <Router to="/invoices" className="child-class">
              Invoices
            </Router>
          </BreadcrumbLink>
        </BreadcrumbItem>
      </Breadcrumb>,
    );
    const link = screen.getByRole('link', { name: 'Invoices' });
    expect(ref.current).toBe(link);
    expect(link.getAttribute('href')).toBe('#/invoices');
    expect(link.getAttribute('aria-describedby')).toBe('d');
    expect(link.className).toContain('custom');
    expect(link.className).toContain('child-class');
    expect(link.className.indexOf('custom')).toBeLessThan(link.className.indexOf('child-class'));
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('a a')).toBeNull();
  });

  it('asChild with a non-element child fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <BreadcrumbLink asChild>
          {'text'}
        </BreadcrumbLink>,
      ),
    ).toThrow(/exactly one React element/);
  });

  it('className wins over the default colour (cn) and onClick is called', () => {
    const onClick = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbLink href="/x" className="text-red-500" onClick={onClick}>
            X
          </BreadcrumbLink>
        </BreadcrumbItem>
      </Breadcrumb>,
    );
    const link = screen.getByRole('link', { name: 'X' });
    expect(link.className).toContain('text-red-500');
    expect(link.className).not.toContain('text-rop-primary ');
    link.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('mounts no tooltip', () => {
    render(<Basic />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
