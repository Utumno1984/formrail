import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

const svg = <svg data-testid="i" viewBox="0 0 10 10" />;

describe('Button', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('type', () => {
    it('renders <button type="button"> by default', () => {
      render(<Button>Salva</Button>);
      expect(screen.getByRole('button', { name: 'Salva' })).toHaveAttribute('type', 'button');
    });

    it('does not submit the enclosing form without an explicit type', async () => {
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <Button>Salva</Button>
        </form>,
      );
      await userEvent.click(screen.getByRole('button'));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('passes an explicit type="submit" to the DOM, which submits', async () => {
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <Button type="submit">Salva</Button>
        </form>,
      );
      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
      await userEvent.click(screen.getByRole('button'));
      expect(onSubmit).toHaveBeenCalledOnce();
    });
  });

  describe('variants and sizes', () => {
    const variants = ['primary', 'secondary', 'ghost', 'danger'] as const;
    const sizes = ['sm', 'md', 'lg', 'inline'] as const;
    const iconSizes = ['icon-xs', 'icon-sm', 'icon-md'] as const;

    it('each variant and each size applies a distinct class set', () => {
      const seen = new Set<string>();
      for (const variant of variants) {
        const { unmount } = render(<Button variant={variant}>x</Button>);
        seen.add(screen.getByRole('button').className);
        unmount();
      }
      expect(seen.size).toBe(variants.length);
      seen.clear();
      for (const size of sizes) {
        const { unmount } = render(<Button size={size}>x</Button>);
        seen.add(screen.getByRole('button').className);
        unmount();
      }
      for (const size of iconSizes) {
        const { unmount } = render(
          <Button size={size} aria-label="x">
            {svg}
          </Button>,
        );
        seen.add(screen.getByRole('button').className);
        unmount();
      }
      expect(seen.size).toBe(sizes.length + iconSizes.length);
    });

    it('defaults to secondary / md', () => {
      const { rerender } = render(<Button>x</Button>);
      const defaults = screen.getByRole('button').className;
      rerender(
        <Button variant="secondary" size="md">
          x
        </Button>,
      );
      expect(screen.getByRole('button').className).toBe(defaults);
    });

    it('inline is underlined (the only non-color cue it is a link, inside running text); other sizes are not', () => {
      const inline = render(<Button size="inline">x</Button>);
      expect(screen.getByRole('button')).toHaveClass('underline');
      expect(screen.getByRole('button')).not.toHaveClass('no-underline');
      inline.unmount();
      for (const size of ['sm', 'md', 'lg'] as const) {
        const { unmount } = render(<Button size={size}>x</Button>);
        expect(screen.getByRole('button')).toHaveClass('no-underline');
        expect(screen.getByRole('button')).not.toHaveClass('underline');
        unmount();
      }
    });
  });

  describe('icon-only accessible name', () => {
    it('console.errors in development when icon-* has no name', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      // @ts-expect-error icon-only sizes require aria-label or aria-labelledby
      render(<Button size="icon-sm">{svg}</Button>);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('accessible name'));
    });

    it('stays silent in production (NODE_ENV replaced by the bundler)', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      // @ts-expect-error icon-only sizes require aria-label or aria-labelledby
      render(<Button size="icon-sm">{svg}</Button>);
      expect(error).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it('treats a blank aria-label as missing', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <Button size="icon-sm" aria-label="  ">
          {svg}
        </Button>,
      );
      expect(error).toHaveBeenCalledOnce();
    });

    it('with aria-label the accessible name is that label, no error', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <Button size="icon-md" aria-label="Chiudi">
          {svg}
        </Button>,
      );
      expect(screen.getByRole('button', { name: 'Chiudi' })).toBeInTheDocument();
      expect(error).not.toHaveBeenCalled();
    });

    it('aria-labelledby is accepted instead of aria-label, no error', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <>
          <span id="lbl">Chiudi</span>
          <Button size="icon-xs" aria-labelledby="lbl">
            {svg}
          </Button>
        </>,
      );
      expect(screen.getByRole('button', { name: 'Chiudi' })).toBeInTheDocument();
      expect(error).not.toHaveBeenCalled();
    });

    it('text sizes never warn', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<Button size="sm">Ok</Button>);
      expect(error).not.toHaveBeenCalled();
    });

    it('a lone svg child of an icon-only button is put on the icon scale', () => {
      render(
        <Button size="icon-md" aria-label="Chiudi">
          {svg}
        </Button>,
      );
      expect(screen.getByTestId('i')).toHaveClass('size-(--icon-rop-lg)');
      expect(screen.getByTestId('i')).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('leading / trailing icons', () => {
    it('are Icons at the size matching the button, decorative, outside the accessible name', () => {
      render(
        <Button size="lg" leadingIcon={<svg data-testid="lead" />} trailingIcon={<svg data-testid="trail" />}>
          Salva
        </Button>,
      );
      for (const id of ['lead', 'trail']) {
        expect(screen.getByTestId(id)).toHaveClass('size-(--icon-rop-md)');
        expect(screen.getByTestId(id)).toHaveAttribute('aria-hidden', 'true');
      }
      expect(screen.getByRole('button', { name: 'Salva' })).toBeInTheDocument();
      const [first, last] = [screen.getByRole('button').firstElementChild, screen.getByRole('button').lastElementChild];
      expect(first).toBe(screen.getByTestId('lead'));
      expect(last).toBe(screen.getByTestId('trail'));
    });

    it('size follows the button size', () => {
      render(
        <Button size="inline" leadingIcon={<svg data-testid="lead" />}>
          x
        </Button>,
      );
      expect(screen.getByTestId('lead')).toHaveClass('size-(--icon-rop-xs)');
    });
  });

  describe('disabled', () => {
    it('sets the native attribute and does not call onClick', async () => {
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          x
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      await userEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('className and ref', () => {
    it('a conflicting consumer class replaces the default (merge via cn)', () => {
      render(
        <Button size="inline" className="h-12 px-8">
          x
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-12', 'px-8');
      expect(button).not.toHaveClass('h-[1lh]');
      expect(button).not.toHaveClass('px-1');
    });

    it('text sizes carry no min-height: a smaller consumer h-* is a plain override', () => {
      render(
        <Button size="md" className="h-8">
          x
        </Button>,
      );
      expect(screen.getByRole('button').className).not.toMatch(/(^|\s)min-h-/);
    });

    it('forwards the ref to the DOM node', () => {
      const ref = createRef<HTMLButtonElement>();
      render(<Button ref={ref}>x</Button>);
      expect(ref.current).toBe(screen.getByRole('button'));
    });
  });

  describe('onClick', () => {
    it('is invoked with the event', async () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>x</Button>);
      await userEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledOnce();
    });

    it('an exception thrown by onClick is not swallowed', () => {
      const failure = new Error('boom');
      const seen: unknown[] = [];
      const onError = (e: ErrorEvent) => {
        seen.push(e.error);
        e.preventDefault();
      };
      window.addEventListener('error', onError);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <Button
          onClick={() => {
            throw failure;
          }}
        >
          x
        </Button>,
      );
      fireEvent.click(screen.getByRole('button'));
      window.removeEventListener('error', onError);
      expect(seen).toContain(failure);
    });
  });

  describe('asChild', () => {
    it('renders the <a> with Button and own classes, composed onClick, ref on the <a>, no <button>', async () => {
      const own = vi.fn((e: React.MouseEvent) => e.preventDefault());
      const outer = vi.fn();
      const ref = createRef<HTMLAnchorElement>();
      render(
        <Button asChild variant="primary" className="mine" onClick={outer} ref={ref}>
          <a href="/x" className="own" onClick={own}>
            Vai
          </a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Vai' });
      expect(link).toHaveAttribute('href', '/x');
      expect(link).toHaveClass('own', 'mine', 'bg-rop-primary');
      expect(link).not.toHaveAttribute('type');
      expect(ref.current).toBe(link);
      expect(screen.queryByRole('button')).toBeNull();
      await userEvent.click(link);
      expect(own).toHaveBeenCalledOnce();
      expect(outer).toHaveBeenCalledOnce();
    });

    it("the child's conflicting classes are merged, not concatenated (child wins)", () => {
      render(
        <Button asChild className="mine">
          <a href="/x" className="px-8 bg-red-600">
            Vai
          </a>
        </Button>,
      );
      const link = screen.getByRole('link');
      expect(link).toHaveClass('px-8', 'bg-red-600', 'mine');
      expect(link).not.toHaveClass('px-3.5');
      expect(link).not.toHaveClass('bg-rop-surface');
    });

    it('disabled wins over tabIndex/aria-disabled declared by the child; explicit type is passed on', () => {
      render(
        <Button asChild disabled type="submit">
          <a href="/x" tabIndex={0} aria-disabled={false}>
            Vai
          </a>
        </Button>,
      );
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).toHaveAttribute('tabindex', '-1');
      expect(link).toHaveAttribute('type', 'submit');
    });

    it('puts the icons inside the child', () => {
      render(
        <Button asChild leadingIcon={<svg data-testid="lead" />}>
          <a href="/x">Vai</a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Vai' });
      expect(link.firstElementChild).toBe(screen.getByTestId('lead'));
    });

    it('disabled on an <a>: aria-disabled, tabIndex -1, click blocked (neither handler runs)', async () => {
      const own = vi.fn();
      const outer = vi.fn();
      render(
        <Button asChild disabled onClick={outer}>
          <a href="/x" onClick={own}>
            Vai
          </a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Vai' });
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).toHaveAttribute('tabindex', '-1');
      expect(link).not.toHaveAttribute('disabled');
      const notPrevented = fireEvent.click(link);
      expect(notPrevented).toBe(false);
      expect(own).not.toHaveBeenCalled();
      expect(outer).not.toHaveBeenCalled();
    });

    it.each([
      ['two children', (<><a href="/a">a</a><a href="/b">b</a></>) as React.ReactNode],
      ['text', 'Vai'],
      ['a Fragment', (<><a href="/a">a</a></>) as React.ReactNode],
      ['nothing', undefined],
    ])('throws a clear error for %s', (_name, children) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<Button asChild>{children}</Button>)).toThrow(/asChild.*exactly one React element/);
    });
  });

  describe('label wrapper', () => {
    it.each(['sm', 'md', 'lg'] as const)('size=%s wraps a text label in a span, with line-height 1 on the button', (size) => {
      render(<Button size={size}>Salva</Button>);
      const button = screen.getByRole('button', { name: 'Salva' });
      const label = button.querySelector(':scope > span');
      expect(label).toHaveTextContent('Salva');
      expect(label).toHaveClass('-top-px');
      expect(button).toHaveClass('leading-none');
      expect(button).not.toHaveClass('text-rop-label');
    });

    it('applies the optical offset to the label only, never to the button or an icon', () => {
      render(
        <Button leadingIcon={svg} trailingIcon={<svg data-testid="t" />}>
          Salva
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button.className).not.toMatch(/-?top-px/);
      expect(screen.getByTestId('i').closest('.-top-px')).toBeNull();
      expect(screen.getByTestId('t').closest('.-top-px')).toBeNull();
      expect(button.querySelectorAll('.-top-px')).toHaveLength(1);
    });

    it('does not wrap inline, icon-only, asChild or element children', () => {
      render(
        <>
          <Button size="inline">inline</Button>
          <Button size="icon-md" aria-label="x">
            {svg}
          </Button>
          <Button asChild>
            <a href="#a">link</a>
          </Button>
          <Button>
            <b>bold</b>
          </Button>
        </>,
      );
      for (const el of [
        screen.getByRole('button', { name: 'inline' }),
        screen.getByRole('button', { name: 'x' }),
        screen.getByRole('link', { name: 'link' }),
        screen.getByRole('button', { name: 'bold' }),
      ]) {
        expect(el.querySelector('.-top-px')).toBeNull();
        expect(el).not.toHaveClass('leading-none');
      }
      expect(screen.getByRole('button', { name: 'bold' })).toHaveClass('text-rop-label');
    });
  });

  it('the primary variant darkens on :active only for an enabled control', () => {
    render(<Button variant="primary">Ok</Button>);
    expect(screen.getByRole('button')).toHaveClass('not-disabled:not-aria-disabled:active:bg-rop-primary-active');
  });
});
