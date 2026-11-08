import { createRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger, type TabsProps } from './Tabs';

function Demo(props: Partial<TabsProps> & { disabled?: string; tabs?: string[] }) {
  const { disabled, tabs = ['a', 'b', 'c'], ...rest } = props;
  return (
    <Tabs {...(rest.value === undefined ? { defaultValue: 'a' } : {})} {...rest}>
      <TabsList aria-label="Sections">
        {tabs.map((t) => (
          <TabsTrigger key={t} value={t} disabled={t === disabled}>
            Tab {t}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t} value={t}>
          <input aria-label={`field ${t}`} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

describe('Tabs', () => {
  it('exposes tablist / tab / tabpanel roles and their relations', () => {
    render(<Demo />);
    const list = screen.getByRole('tablist', { name: 'Sections' });
    expect(list).toHaveAttribute('aria-orientation', 'horizontal');
    const tab = screen.getByRole('tab', { name: 'Tab a' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Tab b' })).toHaveAttribute('aria-selected', 'false');
    const panel = screen.getByRole('tabpanel');
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    // This panel holds an input, so Tab goes straight to it: the panel itself is no tab stop.
    expect(panel).not.toHaveAttribute('tabindex');
  });

  it('roving tabindex: a single tab stop in the list', () => {
    render(<Demo />);
    const tabs = screen.getAllByRole('tab');
    // Only the selected tab is in the tab order; the list itself only redirects focus to it.
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    act(() => tabs[1]?.focus());
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('arrows move focus with wrap, Home/End jump, disabled tabs are skipped (automatic activation selects)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo disabled="b" onValueChange={onValueChange} />);
    await user.tab();
    expect(screen.getByRole('tab', { name: 'Tab a' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tab a' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Tab a' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveFocus();
    expect(onValueChange.mock.calls.map((c) => c[0])).toEqual(['c', 'a', 'c', 'a', 'c']);
  });

  it('manual: arrows only move focus, Enter and Space select', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo activationMode="manual" onValueChange={onValueChange} />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tab b' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Tab b' })).toHaveAttribute('aria-selected', 'false');
    expect(onValueChange).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('tab', { name: 'Tab b' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}{ }');
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveAttribute('aria-selected', 'true');
    expect(onValueChange.mock.calls.map((c) => c[0])).toEqual(['b', 'c']);
  });

  it('vertical: up/down arrows move, left/right do not', async () => {
    const user = userEvent.setup();
    render(<Demo orientation="vertical" />);
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tab a' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'Tab b' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('tab', { name: 'Tab a' })).toHaveFocus();
  });

  it('rtl: left/right are swapped', async () => {
    const user = userEvent.setup();
    render(<Demo dir="rtl" />);
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Tab b' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tab a' })).toHaveFocus();
  });

  it('click selects and calls onValueChange once; uncontrolled uses defaultValue', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo defaultValue="b" onValueChange={onValueChange} />);
    expect(screen.getByRole('tab', { name: 'Tab b' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Tab c' }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('c');
    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByLabelText('field c'));
  });

  it('controlled: an external change updates tab and panel without calling onValueChange', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<Demo value="a" onValueChange={onValueChange} />);
    rerender(<Demo value="c" onValueChange={onValueChange} />);
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('field c')).toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('controlled: a click asks for the change and the tab only moves when the parent follows', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo value="a" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('tab', { name: 'Tab b' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('tab', { name: 'Tab a' })).toHaveAttribute('aria-selected', 'true');
  });

  it('controlled value matching no tab: no panel, no crash, console.error, onValueChange not called', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onValueChange = vi.fn();
    render(<Demo value="zzz" onValueChange={onValueChange} />);
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(error.mock.calls.some((c) => String(c[0]).includes('matches no tab'))).toBe(true);
    expect(onValueChange).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('the selected tab that becomes disabled stays selected (panel kept) and is skipped by the arrows', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Demo defaultValue="b" />);
    rerender(<Demo defaultValue="b" disabled="b" />);
    expect(screen.getByRole('tab', { name: 'Tab b' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Tab a' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveFocus();
  });

  it('all tabs disabled: nothing focusable, the list is out of the tab order, arrows do not loop', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Sections">
          <TabsTrigger value="a" disabled>A</TabsTrigger>
          <TabsTrigger value="b" disabled>B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole('tablist')).toHaveAttribute('tabindex', '-1');
    await user.tab();
    expect(document.body).toHaveFocus();
    await user.keyboard('{ArrowRight}{Home}{End}');
    expect(document.body).toHaveFocus();
  });

  it('dynamic list: roving tabindex stays coherent; removing the focused active tab moves the focus into the list', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Demo tabs={['a', 'b', 'c']} />);
    await user.click(screen.getByRole('tab', { name: 'Tab a' }));
    rerender(<Demo tabs={['a', 'b', 'c', 'd']} />);
    expect(screen.getAllByRole('tab').filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
    rerender(<Demo tabs={['b', 'c', 'd']} />);
    await Promise.resolve();
    expect(document.body).not.toHaveFocus();
    expect(screen.getByRole('tablist')).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getAllByRole('tab').filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('keepMounted keeps inactive panels mounted and hidden, and the typed value survives', async () => {
    const user = userEvent.setup();
    render(<Demo keepMounted />);
    await user.type(screen.getByLabelText('field a'), 'Draft');
    await user.click(screen.getByRole('tab', { name: 'Tab b' }));
    const hidden = document.querySelector<HTMLElement>('[role="tabpanel"][hidden]');
    expect(hidden).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: 'field a' })).toBeNull(); // out of the accessibility tree
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    await user.click(screen.getByRole('tab', { name: 'Tab a' }));
    expect(screen.getByLabelText('field a')).toHaveValue('Draft');
  });

  it('without keepMounted inactive panels are unmounted and the value is lost', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.type(screen.getByLabelText('field a'), 'Draft');
    await user.click(screen.getByRole('tab', { name: 'Tab b' }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(document.querySelectorAll('[role="tabpanel"][hidden]:not(:empty)')).toHaveLength(0);
    await user.click(screen.getByRole('tab', { name: 'Tab a' }));
    expect(screen.getByLabelText('field a')).toHaveValue('');
  });

  it('TabsContent keepMounted overrides the Tabs default', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="S">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a" keepMounted>
          <input aria-label="kept" />
        </TabsContent>
        <TabsContent value="b">B panel</TabsContent>
      </Tabs>,
    );
    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(document.querySelector('[role="tabpanel"][hidden]')).not.toBeNull();
  });

  it('nested tabs: arrows act only on the list that has focus', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="o1">
        <TabsList aria-label="Outer">
          <TabsTrigger value="o1">Outer 1</TabsTrigger>
          <TabsTrigger value="o2">Outer 2</TabsTrigger>
        </TabsList>
        <TabsContent value="o1">
          <Tabs defaultValue="i1">
            <TabsList aria-label="Inner">
              <TabsTrigger value="i1">Inner 1</TabsTrigger>
              <TabsTrigger value="i2">Inner 2</TabsTrigger>
            </TabsList>
            <TabsContent value="i1">i1</TabsContent>
            <TabsContent value="i2">i2</TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="o2">o2</TabsContent>
      </Tabs>,
    );
    await user.click(screen.getByRole('tab', { name: 'Inner 1' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Inner 2' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Outer 1' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a very long label is truncated by a real max-width and keeps its full accessible name', () => {
    const long = 'A very very long tab label that would otherwise stretch the whole list '.repeat(2).trim();
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="S">
          <TabsTrigger value="a">{long}</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const tab = screen.getByRole('tab', { name: long });
    expect(tab).toHaveClass('max-w-64');
    expect(tab.firstElementChild).toHaveClass('truncate');
  });

  it('logs an error in development when the list has no accessible name', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(error.mock.calls.some((c) => String(c[0]).includes('no accessible name'))).toBe(true);
    error.mockRestore();
  });

  it('does not leak non-DOM props; className wins; refs and HTML props are forwarded', () => {
    const refs = {
      root: createRef<HTMLDivElement>(),
      list: createRef<HTMLDivElement>(),
      trigger: createRef<HTMLButtonElement>(),
      content: createRef<HTMLDivElement>(),
    };
    render(
      <Tabs ref={refs.root} defaultValue="a" keepMounted activationMode="manual" orientation="vertical" dir="rtl" className="p-9" data-testid="root">
        <TabsList ref={refs.list} aria-label="S" className="p-8" data-testid="list">
          <TabsTrigger ref={refs.trigger} value="a" className="px-7" data-testid="trigger">A</TabsTrigger>
        </TabsList>
        <TabsContent ref={refs.content} value="a" keepMounted className="p-6" data-testid="content">x</TabsContent>
      </Tabs>,
    );
    for (const r of Object.values(refs)) expect(r.current).toBeInstanceOf(HTMLElement);
    const attrs = (id: string) => screen.getByTestId(id).getAttributeNames().join(' ');
    for (const id of ['root', 'list', 'trigger', 'content']) {
      expect(attrs(id)).not.toMatch(/keepmounted|activationmode|keep-mounted|activation-mode/i);
    }
    expect(screen.getByTestId('root')).toHaveClass('p-9');
    expect(screen.getByTestId('trigger')).toHaveClass('px-7');
    expect(screen.getByTestId('trigger')).not.toHaveClass('px-3');
    expect(screen.getByTestId('list')).toHaveClass('p-8');
    expect(screen.getByTestId('content')).toHaveClass('p-6');
  });

  it('selected and unselected tabs share the same box classes (no weight/padding change)', () => {
    render(<Demo />);
    const [selected, other] = screen.getAllByRole('tab') as [HTMLElement, HTMLElement];
    for (const t of [selected, other]) {
      expect(t.className).toContain('font-medium');
      expect(t.className).toContain('px-3');
      expect(t.className).not.toMatch(/data-\[state=active\]:(font|p[xy]?-)/);
    }
  });

  it('SSR: renderToString works and ids are stable between two renders', () => {
    const html = renderToString(<Demo />);
    expect(html).toContain('role="tablist"');
    const ids = (s: string) => Array.from(s.matchAll(/ id="([^"]+)"/g)).map((m) => m[1]);
    expect(ids(html).length).toBeGreaterThan(0);
    expect(ids(renderToString(<Demo />))).toEqual(ids(html));
  });

  it('controlled parent that refuses the change: every gesture is reported (click, arrows, Enter)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo value="a" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('tab', { name: 'Tab b' }));
    await user.click(screen.getByRole('tab', { name: 'Tab b' }));
    expect(onValueChange.mock.calls.map((c) => c[0])).toEqual(['b', 'b']);
    onValueChange.mockClear();
    render(<Demo value="a" activationMode="manual" onValueChange={onValueChange} />);
    const tab = screen.getAllByRole('tab', { name: 'Tab a' })[1]!;
    await user.click(tab);
    await user.keyboard('{ArrowRight}{Enter}');
    await user.keyboard('{ArrowLeft}{ArrowRight}{Enter}');
    expect(onValueChange.mock.calls.map((c) => c[0])).toEqual(['b', 'b']);
  });

  it('after an external value change Shift+Tab from the panel lands on the selected tab, with no onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<Demo value="a" onValueChange={onValueChange} />);
    rerender(<Demo value="c" onValueChange={onValueChange} />);
    await user.click(screen.getByLabelText('field c'));
    await user.tab({ shift: true });
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('removing the focused active tab while the consumer selects another keeps the consumer choice', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<Demo value="a" tabs={['a', 'b', 'c']} onValueChange={onValueChange} />);
    await user.click(screen.getByRole('tab', { name: 'Tab a' }));
    onValueChange.mockClear();
    rerender(<Demo value="c" tabs={['b', 'c']} onValueChange={onValueChange} />);
    await Promise.resolve();
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('inherits the direction of the document when no dir is given', () => {
    document.documentElement.dir = 'rtl';
    try {
      render(<Demo />);
      expect(screen.getAllByRole('tablist')[0]!.closest('[data-rop-tabs]')).toHaveAttribute('dir', 'rtl');
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });

  it('the panel is a tab stop only when it has no focusable content', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="S">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">
          <input aria-label="x" />
        </TabsContent>
        <TabsContent value="b">plain</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel')).not.toHaveAttribute('tabindex');
    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(screen.getByRole('tabpanel')).toHaveAttribute('tabindex', '0');
  });

  it('a panel that starts with plain text and receives an input after mount drops its tabindex', async () => {
    function Late() {
      const [show, setShow] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setShow(true)}>
            add
          </button>
          <Tabs defaultValue="a">
            <TabsList aria-label="S">
              <TabsTrigger value="a">A</TabsTrigger>
            </TabsList>
            <TabsContent value="a">{show ? <input aria-label="late" /> : 'plain'}</TabsContent>
          </Tabs>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Late />);
    expect(screen.getByRole('tabpanel')).toHaveAttribute('tabindex', '0');
    await user.click(screen.getByRole('button', { name: 'add' }));
    await screen.findByLabelText('late');
    await vi.waitFor(() => expect(screen.getByRole('tabpanel')).not.toHaveAttribute('tabindex'));
  });

  it('removing the focused tab does not steal the focus the consumer moved elsewhere in the same render', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Host({ removed }: { removed: boolean }) {
      return (
        <>
          <Demo value="a" tabs={removed ? ['b', 'c'] : ['a', 'b', 'c']} onValueChange={onValueChange} />
          {removed ? <input aria-label="elsewhere" ref={(el) => el?.focus()} /> : null}
        </>
      );
    }
    const { rerender } = render(<Host removed={false} />);
    await user.click(screen.getByRole('tab', { name: 'Tab a' }));
    onValueChange.mockClear();
    rerender(<Host removed />);
    await Promise.resolve();
    expect(screen.getByLabelText('elsewhere')).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a consumer tabIndex on a trigger cannot break the single tab stop', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="S">
          <TabsTrigger value="a" tabIndex={-1}>A</TabsTrigger>
          <TabsTrigger value="b" tabIndex={0}>B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('tabindex', '-1');
  });

  it('a consumer tabIndex on a panel cannot override the "tab stop only without focusable content" rule', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="S">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a" tabIndex={0}>
          <input aria-label="x" />
        </TabsContent>
        <TabsContent value="b" tabIndex={-1}>plain</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel')).not.toHaveAttribute('tabindex');
  });

  it('a tab with value="" is not selected when there is no value or defaultValue', () => {
    render(
      <Tabs>
        <TabsList aria-label="S">
          <TabsTrigger value="">Empty</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="">empty panel</TabsContent>
        <TabsContent value="b">b panel</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'Empty' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('a tab with value="" can be selected and controlled like any other', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Tabs defaultValue="b" onValueChange={onValueChange}>
        <TabsList aria-label="S">
          <TabsTrigger value="">Empty</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="">empty panel</TabsContent>
        <TabsContent value="b">b panel</TabsContent>
      </Tabs>,
    );
    await user.click(screen.getByRole('tab', { name: 'Empty' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('empty panel');
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('the "matches no tab" warning is re-checked when the set of tabs changes while value stays', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<Demo value="b" tabs={['a', 'b']} />);
    expect(error.mock.calls.some((c) => String(c[0]).includes('matches no tab'))).toBe(false);
    rerender(<Demo value="b" tabs={['a', 'c']} />);
    await vi.waitFor(() => expect(error.mock.calls.some((c) => String(c[0]).includes('matches no tab'))).toBe(true));
    error.mockRestore();
  });

  it('SSR: the server markup hydrates without errors', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(<Demo />);
    const { hydrateRoot } = await import('react-dom/client');
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Demo />);
    });
    expect(error).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
    error.mockRestore();
  });

  it('a controlled wrapper that follows onValueChange behaves like a normal tab set', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [v, setV] = useState('a');
      return <Demo value={v} onValueChange={setV} />;
    }
    render(<Controlled />);
    await user.click(screen.getByRole('tab', { name: 'Tab c' }));
    expect(screen.getByRole('tab', { name: 'Tab c' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Tabs: overflow edge indicators (horizontal)', () => {
  /** jsdom has no layout: give the tablist a scroll geometry and report it with a scroll event. */
  function setGeometry(list: HTMLElement, { scrollWidth, clientWidth, scrollLeft }: Record<string, number>) {
    Object.defineProperty(list, 'scrollWidth', { configurable: true, value: scrollWidth });
    Object.defineProperty(list, 'clientWidth', { configurable: true, value: clientWidth });
    list.scrollLeft = scrollLeft!;
    act(() => {
      list.dispatchEvent(new Event('scroll'));
    });
  }
  const edge = (side: 'start' | 'end') => document.querySelector<HTMLElement>(`[data-rop-tabs-edge="${side}"]`);

  it('no indicator when the tabs fit; the tablist keeps ref, className and props inside a positioning box', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Sections" ref={ref} className="custom" data-testid="list">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = screen.getByRole('tablist');
    expect(ref.current).toBe(list);
    expect(list).toHaveClass('custom');
    expect(list).toHaveAttribute('data-testid', 'list');
    expect(list.parentElement).toHaveAttribute('data-rop-tabs-scroll');
    expect(edge('start')).toBeNull();
    expect(edge('end')).toBeNull();
  });

  it('shows the indicator only on the side that hides tabs, following the scroll position', () => {
    render(<Demo />);
    const list = screen.getByRole('tablist');
    setGeometry(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
    expect(edge('start')).toBeNull();
    expect(edge('end')).not.toBeNull();
    setGeometry(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 150 });
    expect(edge('start')).not.toBeNull();
    expect(edge('end')).not.toBeNull();
    setGeometry(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 300 });
    expect(edge('start')).not.toBeNull();
    expect(edge('end')).toBeNull();
    // A sub-pixel remainder at either end is not hidden content.
    setGeometry(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 299.5 });
    expect(edge('end')).toBeNull();
    setGeometry(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0.5 });
    expect(edge('start')).toBeNull();
    // Content that fits again: no indicator at all.
    setGeometry(list, { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 });
    expect(edge('start')).toBeNull();
    expect(edge('end')).toBeNull();
  });

  it('the indicators are hidden from assistive technology, not focusable, outside the tablist, and keep the focus', () => {
    render(<Demo />);
    const list = screen.getByRole('tablist');
    setGeometry(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 150 });
    for (const side of ['start', 'end'] as const) {
      const el = edge(side)!;
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el).not.toHaveAttribute('tabindex');
      expect(el.tagName).toBe('DIV');
      expect(list.contains(el)).toBe(false);
    }
    // The tablist still owns only tabs.
    expect(Array.from(list.children).every((c) => c.getAttribute('role') === 'tab')).toBe(true);
    const tab = screen.getByRole('tab', { name: 'Tab a' });
    act(() => tab.focus());
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    edge('end')!.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(tab).toHaveFocus();
  });

  it('a click scrolls one view (minus both indicators) towards that side; mirrored in RTL', async () => {
    const user = userEvent.setup();
    const calls: Array<{ left?: number; behavior?: ScrollBehavior }> = [];
    const scrollBy = vi.fn((opts: ScrollToOptions) => calls.push({ left: opts.left, behavior: opts.behavior }));
    const { unmount } = render(<Demo />);
    let list = screen.getByRole('tablist');
    Object.defineProperty(list, 'scrollBy', { configurable: true, value: scrollBy });
    setGeometry(list, { scrollWidth: 900, clientWidth: 300, scrollLeft: 150 });
    await user.click(edge('end')!);
    await user.click(edge('start')!);
    expect(calls.map((c) => c.left)).toEqual([300 - 96, -(300 - 96)]);
    expect(calls[0]?.behavior).toBe('smooth');
    unmount();

    // RTL: Chromium reports scroll positions as 0 at the start and negative towards the end.
    calls.length = 0;
    render(
      <div dir="rtl" style={{ direction: 'rtl' }}>
        <Demo dir="rtl" />
      </div>,
    );
    list = screen.getByRole('tablist');
    Object.defineProperty(list, 'scrollBy', { configurable: true, value: scrollBy });
    setGeometry(list, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });
    // Nothing hidden at the start (the right edge), tabs hidden towards the end (the left edge).
    expect(edge('start')).toBeNull();
    expect(edge('end')).not.toBeNull();
    // The end indicator sits at the inline end (the left edge in RTL), solid there and fading
    // towards the tabs on its right.
    expect(edge('end')).toHaveClass('end-0', 'bg-linear-to-r');
    await user.click(edge('end')!);
    expect(calls.map((c) => c.left)).toEqual([-(300 - 96)]);
    setGeometry(list, { scrollWidth: 900, clientWidth: 300, scrollLeft: -600 });
    expect(edge('start')).toHaveClass('start-0', 'bg-linear-to-l');
    expect(edge('end')).toBeNull();
  });

  it('LTR: the start indicator is solid at the left edge, the end one at the right edge', () => {
    render(<Demo />);
    const list = screen.getByRole('tablist');
    setGeometry(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 150 });
    expect(edge('start')).toHaveClass('start-0', 'bg-linear-to-r');
    expect(edge('end')).toHaveClass('end-0', 'bg-linear-to-l');
  });

  it('prefers-reduced-motion: the click scrolls without smooth behaviour', async () => {
    const user = userEvent.setup();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      const scrollBy = vi.fn();
      render(<Demo />);
      const list = screen.getByRole('tablist');
      Object.defineProperty(list, 'scrollBy', { configurable: true, value: scrollBy });
      setGeometry(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
      await user.click(edge('end')!);
      expect(scrollBy).toHaveBeenCalledWith({ left: 300 - 96, behavior: 'auto' });
    } finally {
      window.matchMedia = original;
    }
  });

  it('vertical lists keep their original structure and never show indicators', () => {
    render(<Demo orientation="vertical" />);
    const list = screen.getByRole('tablist');
    expect(list.parentElement).not.toHaveAttribute('data-rop-tabs-scroll');
    expect(list.parentElement).toHaveAttribute('data-rop-tabs');
    setGeometry(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 150 });
    expect(edge('start')).toBeNull();
    expect(edge('end')).toBeNull();
  });
});
