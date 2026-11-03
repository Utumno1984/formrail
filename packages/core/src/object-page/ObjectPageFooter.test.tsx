import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectPage } from './ObjectPage';
import { ObjectPageFooter } from './ObjectPageFooter';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';

afterEach(() => vi.restoreAllMocks());

const slotOf = (container: HTMLElement) => container.querySelector('[data-object-page-footer-slot]') as HTMLElement;
const footerOf = (container: HTMLElement) => container.querySelector('[data-object-page-footer]') as HTMLElement;

describe('ObjectPageFooter placement', () => {
  it('goes to the slot below the scroller even when written before the sections', () => {
    const { container } = render(
      <ObjectPage>
        <ObjectPageFooter visible>
          <button>Salva</button>
        </ObjectPageFooter>
        <ObjectPageHeader title="Fattura" />
        <ObjectPageSection id="a" title="A">
          x
        </ObjectPageSection>
      </ObjectPage>,
    );
    const scroller = container.querySelector('[data-object-page-scroller]') as HTMLElement;
    expect(slotOf(container).contains(footerOf(container))).toBe(true);
    expect(scroller.contains(footerOf(container))).toBe(false);
    expect(scroller.nextElementSibling).toBe(slotOf(container));
  });

  it('is a region with the default name, holding the actions', () => {
    render(
      <ObjectPage>
        <ObjectPageFooter visible>
          <button>Salva</button>
        </ObjectPageFooter>
      </ObjectPage>,
    );
    const region = screen.getByRole('region', { name: 'Save actions' });
    expect(region).toContainElement(screen.getByRole('button', { name: 'Salva' }));
  });

  it('takes a custom label', () => {
    render(
      <ObjectPage>
        <ObjectPageFooter visible label="Save actions" />
      </ObjectPage>,
    );
    expect(screen.getByRole('region', { name: 'Save actions' })).toBeInTheDocument();
  });

  it('declares the room of the actions row with a CSS variable, hidden or not', () => {
    const { container, rerender } = render(
      <ObjectPage>
        <ObjectPageFooter visible={false} />
      </ObjectPage>,
    );
    expect(footerOf(container).className).toContain('[--rop-object-page-footer-height:3.5rem]');
    rerender(
      <ObjectPage>
        <ObjectPageFooter visible />
      </ObjectPage>,
    );
    expect(footerOf(container).className).toContain('[--rop-object-page-footer-height:3.5rem]');
  });

  it('forwards the ref to the footer element', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <ObjectPage>
        <ObjectPageFooter ref={ref} visible />
      </ObjectPage>,
    );
    expect(ref.current).toBe(footerOf(container));
  });
});

describe('ObjectPageFooter hidden', () => {
  it('is mounted from the first render, inert and out of the accessibility tree', () => {
    const { container } = render(
      <ObjectPage>
        <ObjectPageFooter visible={false}>
          <button>Salva</button>
        </ObjectPageFooter>
      </ObjectPage>,
    );
    const footer = footerOf(container);
    expect(footer).toHaveAttribute('inert');
    expect(footer).toHaveClass('invisible');
    // Out of the accessibility tree comes from `visibility: hidden`, which jsdom (no stylesheet) does not
    // apply: e2e/object-page-footer.spec.ts checks it in a real browser.
  });

  it('puts inert on and off with `visible`', () => {
    const { container, rerender } = render(
      <ObjectPage>
        <ObjectPageFooter visible={false} />
      </ObjectPage>,
    );
    expect(footerOf(container)).toHaveAttribute('inert');
    rerender(
      <ObjectPage>
        <ObjectPageFooter visible />
      </ObjectPage>,
    );
    expect(footerOf(container)).not.toHaveAttribute('inert');
    expect(footerOf(container)).not.toHaveClass('invisible');
    rerender(
      <ObjectPage>
        <ObjectPageFooter visible={false} />
      </ObjectPage>,
    );
    expect(footerOf(container)).toHaveAttribute('inert');
  });

  it('keeps the same element (no remount) when `visible` changes', () => {
    const { container, rerender } = render(
      <ObjectPage>
        <ObjectPageFooter visible={false} />
      </ObjectPage>,
    );
    const before = footerOf(container);
    rerender(
      <ObjectPage>
        <ObjectPageFooter visible />
      </ObjectPage>,
    );
    expect(footerOf(container)).toBe(before);
  });
});

function Demo({ withHeader = true }: { withHeader?: boolean }) {
  const [visible, setVisible] = useState(true);
  return (
    <ObjectPage>
      {withHeader ? <ObjectPageHeader title="Fattura 2026/0142" /> : null}
      <ObjectPageFooter visible={visible}>
        <button onClick={() => setVisible(false)}>Salva</button>
      </ObjectPageFooter>
      <button onClick={() => setVisible(true)}>Modifica</button>
    </ObjectPage>
  );
}

describe('ObjectPageFooter focus', () => {
  it('moves the focus to the header title when it hides with the focus inside', async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Fattura 2026/0142' })).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('moves the focus to the page root when there is no header', async () => {
    const { container } = render(<Demo withHeader={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(container.firstElementChild).toHaveFocus();
    expect(container.firstElementChild).toHaveAttribute('tabindex', '-1');
    // The root is focusable only while it holds the focus.
    await userEvent.click(screen.getByRole('button', { name: 'Modifica' }));
    expect(container.firstElementChild).not.toHaveAttribute('tabindex');
  });

  it('does not touch the focus when it was somewhere else', async () => {
    const page = (visible: boolean) => (
      <ObjectPage>
        <ObjectPageHeader title="Fattura" />
        <ObjectPageFooter visible={visible}>
          <button>Salva</button>
        </ObjectPageFooter>
        <button>Altrove</button>
      </ObjectPage>
    );
    const { rerender } = render(page(true));
    const other = screen.getByRole('button', { name: 'Altrove' });
    other.focus();
    rerender(page(false));
    expect(other).toHaveFocus();
  });

  it('moves the focus out when the footer unmounts with the focus inside', async () => {
    function Unmounting() {
      const [on, setOn] = useState(true);
      return (
        <ObjectPage>
          <ObjectPageHeader title="Fattura" />
          {on ? (
            <ObjectPageFooter visible>
              <button onClick={() => setOn(false)}>Salva</button>
            </ObjectPageFooter>
          ) : null}
        </ObjectPage>
      );
    }
    render(<Unmounting />);
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});

describe('ObjectPageFooter message', () => {
  it('keeps a status live region mounted with no message', () => {
    const { container } = render(
      <ObjectPage>
        <ObjectPageFooter visible />
      </ObjectPage>,
    );
    const status = container.querySelector('[data-object-page-footer-message]') as HTMLElement;
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
  });

  it('shows the message on one line, with the tone name for assistive technology', () => {
    render(
      <ObjectPage>
        <ObjectPageFooter visible message="Salvataggio non riuscito" messageTone="error" />
      </ObjectPage>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Error: Salvataggio non riuscito');
    const text = screen.getByText('Salvataggio non riuscito');
    expect(text).toHaveClass('whitespace-nowrap', 'text-ellipsis');
  });

  it('colours the icon by tone', () => {
    const { rerender } = render(
      <ObjectPage>
        <ObjectPageFooter visible message="x" messageTone="error" />
      </ObjectPage>,
    );
    expect(screen.getByRole('status').innerHTML).toContain('text-rop-error');
    rerender(
      <ObjectPage>
        <ObjectPageFooter visible message="x" messageTone="success" />
      </ObjectPage>,
    );
    expect(screen.getByRole('status').innerHTML).toContain('text-rop-success');
    expect(screen.getByRole('status')).toHaveTextContent('Success: x');
  });

  it('takes a custom tone label', () => {
    render(
      <ObjectPage>
        <ObjectPageFooter visible message="x" toneLabel="Error" />
      </ObjectPage>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Error: x');
  });
});

describe('ObjectPageFooter props', () => {
  it('does not leak its own props to the DOM', () => {
    const { container } = render(
      <ObjectPage>
        <ObjectPageFooter visible message="m" messageTone="error" toneLabel="t" label="l" />
      </ObjectPage>,
    );
    const footer = footerOf(container);
    for (const name of ['visible', 'message', 'messagetone', 'tonelabel']) {
      expect(footer.hasAttribute(name)).toBe(false);
    }
    expect(container.innerHTML).not.toMatch(/messageTone|toneLabel/);
  });

  it('lets className win over the defaults and passes HTML props on', () => {
    const { container } = render(
      <ObjectPage>
        <ObjectPageFooter visible className="bg-red-500 px-2" data-testid="f" />
      </ObjectPage>,
    );
    const footer = footerOf(container);
    expect(footer).toHaveClass('bg-red-500', 'px-2');
    expect(footer).not.toHaveClass('bg-rop-surface');
    expect(footer).not.toHaveClass('px-4');
    expect(footer).toHaveAttribute('data-testid', 'f');
  });
});

describe('ObjectPageFooter errors and duplicates', () => {
  it('throws in development outside an ObjectPage', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ObjectPageFooter visible />)).toThrow(/must be rendered inside an <ObjectPage>/);
  });

  it('warns about a second footer and renders only the first', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <ObjectPage>
        <ObjectPageFooter visible label="Primo" />
        <ObjectPageFooter visible label="Secondo" />
      </ObjectPage>,
    );
    expect(container.querySelectorAll('[data-object-page-footer]')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Primo' })).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('only one footer'));
  });

  it('renders the second footer once the first is gone', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = render(
      <ObjectPage>
        <ObjectPageFooter visible label="Primo" />
        <ObjectPageFooter visible label="Secondo" />
      </ObjectPage>,
    );
    rerender(
      <ObjectPage>
        <ObjectPageFooter visible label="Secondo" />
      </ObjectPage>,
    );
    expect(screen.getByRole('region', { name: 'Secondo' })).toBeInTheDocument();
  });
});
