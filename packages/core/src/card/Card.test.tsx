import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { Card, CardBody, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';

afterEach(() => vi.restoreAllMocks());

describe('Card', () => {
  it('renders a <div> by default, without aria-labelledby', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card).not.toHaveAttribute('aria-labelledby');
  });

  it.each(['section', 'article'] as const)('as="%s" is named by its CardTitle', (as) => {
    render(
      <Card as={as} data-testid="card">
        <CardTitle>Billing</CardTitle>
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe(as.toUpperCase());
    expect(card).toHaveAttribute('aria-labelledby', screen.getByRole('heading', { name: 'Billing' }).id);
    expect(screen.getByRole(as === 'section' ? 'region' : 'article', { name: 'Billing' })).toBe(card);
  });

  it('uses a custom title id, and drops aria-labelledby when the title unmounts', () => {
    const { rerender } = render(
      <Card as="section" data-testid="card">
        <CardTitle id="mine">Billing</CardTitle>
      </Card>,
    );
    expect(screen.getByTestId('card')).toHaveAttribute('aria-labelledby', 'mine');
    rerender(<Card as="section" aria-label="x" data-testid="card" />);
    expect(screen.getByTestId('card')).not.toHaveAttribute('aria-labelledby');
  });

  it('an own aria-labelledby or aria-label wins over the title', () => {
    render(
      <>
        <Card as="section" aria-labelledby="other" data-testid="a">
          <CardTitle>T</CardTitle>
        </Card>
        <Card as="section" aria-label="Own name" data-testid="b">
          <CardTitle>T</CardTitle>
        </Card>
      </>,
    );
    expect(screen.getByTestId('a')).toHaveAttribute('aria-labelledby', 'other');
    expect(screen.getByTestId('b')).not.toHaveAttribute('aria-labelledby');
    expect(screen.getByTestId('b')).toHaveAttribute('aria-label', 'Own name');
  });

  it('a section without a title: no aria-labelledby and a development warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Card as="section" data-testid="card" />);
    expect(screen.getByTestId('card')).not.toHaveAttribute('aria-labelledby');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('no accessible name');
  });

  it('does not warn for a div, nor for a named section', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <>
        <Card />
        <Card as="article">
          <CardTitle>T</CardTitle>
        </Card>
      </>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('two cards with the same title get different ids', () => {
    render(
      <>
        <Card as="section" data-testid="a">
          <CardTitle>Same</CardTitle>
        </Card>
        <Card as="section" data-testid="b">
          <CardTitle>Same</CardTitle>
        </Card>
      </>,
    );
    const a = screen.getByTestId('a').getAttribute('aria-labelledby');
    const b = screen.getByTestId('b').getAttribute('aria-labelledby');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
    expect(document.getElementById(a!)).toHaveTextContent('Same');
  });
});

describe('CardTitle', () => {
  it('renders <h3> by default and the requested level 2-6', () => {
    render(
      <Card>
        <CardTitle>Default</CardTitle>
        <CardTitle level={2}>Two</CardTitle>
        <CardTitle level={6}>Six</CardTitle>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Default' }).tagName).toBe('H3');
    expect(screen.getByRole('heading', { name: 'Two' }).tagName).toBe('H2');
    expect(screen.getByRole('heading', { name: 'Six' }).tagName).toBe('H6');
  });

  it('works outside a Card without throwing', () => {
    render(<CardTitle>Alone</CardTitle>);
    expect(screen.getByRole('heading', { name: 'Alone' })).toBeInTheDocument();
  });
});

describe('Card parts', () => {
  it('CardDescription is muted text', () => {
    render(<CardDescription>Hint</CardDescription>);
    expect(screen.getByText('Hint').tagName).toBe('P');
    expect(screen.getByText('Hint').className).toContain('text-rop-text-muted');
  });

  it('never uses overflow-hidden and only token classes (no literal colours, no z-index, no elevation)', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>T</CardTitle>
          <CardDescription>D</CardDescription>
        </CardHeader>
        <CardBody>B</CardBody>
        <CardFooter>F</CardFooter>
      </Card>,
    );
    const classes = Array.from(container.querySelectorAll('*')).map((el) => el.getAttribute('class') ?? '').join(' ');
    expect(classes).not.toMatch(/\boverflow-(hidden|clip|auto|scroll)\b/);
    expect(classes).not.toMatch(/\bz-|sha[d]ow|#[0-9a-f]{3,6}|rgb/);
    expect(classes).toContain('border-rop-border');
    expect(classes).toContain('bg-rop-surface');
    expect(classes).toContain('rounded-rop-lg');
    expect(classes).toContain('[overflow-wrap:anywhere]');
    expect(screen.getByText('F').className).toContain('flex-wrap');
    expect(screen.getByText('F').className).toContain('justify-end');
  });

  it('className wins over the defaults (real merge), on every part', () => {
    render(
      <Card className="rounded-none" data-testid="card">
        <CardHeader className="px-1" data-testid="h" />
        <CardBody className="py-0" data-testid="b" />
        <CardFooter className="gap-4" data-testid="f" />
        <CardTitle className="min-w-full">T</CardTitle>
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('rounded-none');
    expect(card.className).not.toContain('rounded-rop-lg');
    expect(screen.getByTestId('h').className).not.toContain('px-4');
    expect(screen.getByTestId('b').className).not.toContain('py-4');
    expect(screen.getByTestId('f').className).not.toMatch(/\bgap-2\b/);
    expect(screen.getByRole('heading').className).not.toContain('min-w-0');
  });

  it('does not leak non-DOM props (as, level) and forwards the other attributes', () => {
    render(
      <Card as="article" id="c" data-testid="card" lang="it">
        <CardTitle level={4} data-testid="t">
          T
        </CardTitle>
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card).not.toHaveAttribute('as');
    expect(card).toHaveAttribute('id', 'c');
    expect(card).toHaveAttribute('lang', 'it');
    expect(screen.getByTestId('t')).not.toHaveAttribute('level');
  });

  it('forwards the ref on every part', () => {
    const refs = {
      card: createRef<HTMLElement>(),
      header: createRef<HTMLDivElement>(),
      title: createRef<HTMLHeadingElement>(),
      desc: createRef<HTMLParagraphElement>(),
      body: createRef<HTMLDivElement>(),
      footer: createRef<HTMLDivElement>(),
    };
    render(
      <Card as="section" ref={refs.card}>
        <CardHeader ref={refs.header}>
          <CardTitle ref={refs.title}>T</CardTitle>
          <CardDescription ref={refs.desc}>D</CardDescription>
        </CardHeader>
        <CardBody ref={refs.body}>B</CardBody>
        <CardFooter ref={refs.footer}>F</CardFooter>
      </Card>,
    );
    expect(refs.card.current?.tagName).toBe('SECTION');
    expect(refs.header.current).toBeInstanceOf(HTMLDivElement);
    expect(refs.title.current?.tagName).toBe('H3');
    expect(refs.desc.current?.tagName).toBe('P');
    expect(refs.body.current).toBeInstanceOf(HTMLDivElement);
    expect(refs.footer.current).toBeInstanceOf(HTMLDivElement);
  });
});
