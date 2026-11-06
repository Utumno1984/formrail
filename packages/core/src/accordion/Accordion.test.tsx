import { createRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Input } from '../input/Input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './Accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './Collapsible';

const Demo = (props: Partial<React.ComponentProps<typeof Accordion>> & { type?: 'single' | 'multiple' }) => {
  const { type = 'single', ...rest } = props;
  return (
    <Accordion {...({ type, ...rest } as React.ComponentProps<typeof Accordion>)}>
      <AccordionItem value="a">
        <AccordionTrigger>First</AccordionTrigger>
        <AccordionContent>
          <Input aria-label="Field A" />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="b" disabled>
        <AccordionTrigger>Second</AccordionTrigger>
        <AccordionContent>B body</AccordionContent>
      </AccordionItem>
      <AccordionItem value="c">
        <AccordionTrigger>Third</AccordionTrigger>
        <AccordionContent>
          <Input aria-label="Field C" />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

describe('Collapsible', () => {
  it('toggles with click, Enter and Space; exposes aria-expanded / aria-controls', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Collapsible onOpenChange={onOpenChange}>
        <CollapsibleTrigger>More</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>,
    );
    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger.getAttribute('aria-controls')).toBe(screen.getByText('Body').closest('[id]')!.id);
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard(' ');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(onOpenChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('defaultOpen renders open', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>More</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Body')).toBeVisible();
  });

  it('disabled blocks click and keyboard', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Collapsible disabled onOpenChange={onOpenChange}>
        <CollapsibleTrigger>More</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>,
    );
    const trigger = screen.getByRole('button', { name: 'More' });
    await user.click(trigger);
    trigger.focus();
    await user.keyboard('{Enter} ');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('controlled: changing `open` from outside does not call onOpenChange', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Collapsible open={false} onOpenChange={onOpenChange}>
        <CollapsibleTrigger>More</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.queryByText('Body')).toBeNull();
    rerender(
      <Collapsible open onOpenChange={onOpenChange}>
        <CollapsibleTrigger>More</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    // A controlled parent that refuses the change keeps it closed/open.
    await userEvent.setup().click(screen.getByRole('button', { name: 'More' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('closed content is not in the DOM (no tab stop, no a11y tree)', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>More</CollapsibleTrigger>
        <CollapsibleContent>
          <Input aria-label="Inner" />
        </CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('moves the focus to the trigger when an open panel holding it is closed from outside', () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            outside
          </button>
          <Collapsible open={open}>
            <CollapsibleTrigger>More</CollapsibleTrigger>
            <CollapsibleContent>
              <Input aria-label="Inner" />
            </CollapsibleContent>
          </Collapsible>
        </>
      );
    }
    render(<Host />);
    screen.getByRole('textbox', { name: 'Inner' }).focus();
    expect(screen.getByRole('textbox', { name: 'Inner' })).toHaveFocus();
    // Closed by the app (not by a click that would move the focus).
    const close = screen.getByRole('button', { name: 'outside' });
    fireEvent.click(close);
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();
  });

  it('forwards ref and props, className wins, no non-DOM prop leaks', () => {
    const ref = createRef<HTMLDivElement>();
    const triggerRef = createRef<HTMLButtonElement>();
    const { container } = render(
      <Collapsible ref={ref} className="p-9" data-testid="root" defaultOpen onOpenChange={() => {}}>
        <CollapsibleTrigger ref={triggerRef} className="p-8" data-x="1">
          More
        </CollapsibleTrigger>
        <CollapsibleContent className="p-7" data-y="2">
          Body
        </CollapsibleContent>
      </Collapsible>,
    );
    expect(ref.current).toBe(screen.getByTestId('root'));
    expect(ref.current!.className).toContain('p-9');
    expect(triggerRef.current).toBe(screen.getByRole('button'));
    expect(triggerRef.current!.className).toContain('p-8');
    expect(triggerRef.current!.className).not.toMatch(/(^| )px-3( |$)/ );
    expect(screen.getByText('Body').closest('[data-y]')!.className).toContain('p-7');
    for (const attr of ['defaultopen', 'onopenchange', 'open', 'headinglevel']) {
      expect(container.innerHTML.toLowerCase()).not.toContain(` ${attr}=`);
    }
  });
});

describe('Accordion', () => {
  it('wraps each trigger in an h3 by default, configurable with headingLevel; panel is a labelled region', () => {
    const { unmount } = render(<Demo defaultValue="a" />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    const region = screen.getByRole('region', { name: 'First' });
    expect(region).toBeInTheDocument();
    unmount();
    render(<Demo headingLevel={5} />);
    expect(screen.getAllByRole('heading', { level: 5 })).toHaveLength(3);
  });

  it('single: opening another closes the first; collapsible default lets the open one close', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'First' }));
    await user.click(screen.getByRole('button', { name: 'Third' }));
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Third' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Third' }));
    expect(onValueChange.mock.calls).toEqual([['a'], ['c'], ['']]);
  });

  it('single, collapsible={false}: clicking the open item does nothing and does not call onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo collapsible={false} defaultValue="a" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'First' }));
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-expanded', 'true');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('multiple: several items open, value is an array', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo type="multiple" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'First' }));
    await user.click(screen.getByRole('button', { name: 'Third' }));
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-expanded', 'true');
    expect(onValueChange).toHaveBeenLastCalledWith(['a', 'c']);
  });

  it('keyboard: arrows wrap and skip the disabled item; Home / End; Enter toggles', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Third' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: 'Third' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Third' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Third' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('Tab from a closed trigger does not enter its content; closed Input is not in the DOM', async () => {
    const user = userEvent.setup();
    render(<Demo defaultValue="a" />);
    expect(screen.queryByRole('textbox', { name: 'Field C' })).toBeNull();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Field A' })).toHaveFocus();
    await user.tab();
    // Second is disabled; the next stop is Third's trigger, then nothing inside it.
    expect(screen.getByRole('button', { name: 'Third' })).toHaveFocus();
  });

  it('controlled: changing value from outside does not call onValueChange; unmatched value closes all', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<Demo value="" onValueChange={onValueChange} />);
    rerender(<Demo value="c" onValueChange={onValueChange} />);
    expect(screen.getByRole('button', { name: 'Third' })).toHaveAttribute('aria-expanded', 'true');
    rerender(<Demo value="nope" onValueChange={onValueChange} />);
    for (const name of ['First', 'Second', 'Third']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
    rerender(<Demo type="multiple" value={['a', 'c']} onValueChange={onValueChange} />);
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-expanded', 'true');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('closing from outside moves the focus from the closed panel to its trigger, not <body>', () => {
    function Host() {
      const [value, setValue] = useState('a');
      return (
        <>
          <button type="button" onClick={() => setValue('')}>
            close
          </button>
          <Demo value={value} />
        </>
      );
    }
    render(<Host />);
    screen.getByRole('textbox', { name: 'Field A' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('forwards ref and props, className wins, no non-DOM prop leaks', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<Demo ref={ref} className="p-9" data-testid="root" collapsible={false} defaultValue="a" headingLevel={4} />);
    expect(ref.current).toBe(screen.getByTestId('root'));
    expect(ref.current!.className).toContain('p-9');
    const html = container.innerHTML.toLowerCase();
    for (const attr of ['collapsible', 'headinglevel', 'defaultvalue', 'onvaluechange']) {
      expect(html).not.toContain(` ${attr}=`);
    }
  });

  it('SSR: a default-open item renders its content open and hydrates without errors', () => {
    const html = renderToString(<Demo defaultValue="a" />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="region"');
    expect(html).toContain('<input');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onRecoverableError = vi.fn();
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    let root: ReturnType<typeof hydrateRoot>;
    act(() => {
      root = hydrateRoot(host, <Demo defaultValue="a" />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
    host.remove();
    errors.mockRestore();
  });

  it('single: an item with value="" never opens and logs an error in development', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onValueChange = vi.fn();
    render(
      <Accordion type="single" onValueChange={onValueChange}>
        <AccordionItem value="">
          <AccordionTrigger>Empty</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Empty' }));
    expect(screen.getByRole('button', { name: 'Empty' })).toHaveAttribute('aria-expanded', 'false');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('value=""'));
    errors.mockRestore();
  });
});
