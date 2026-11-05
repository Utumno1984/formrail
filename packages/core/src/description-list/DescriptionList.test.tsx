import { createRef, Fragment } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DescriptionList, DescriptionListItem } from './DescriptionList';

describe('DescriptionList', () => {
  describe('markup', () => {
    it('renders a <dl> of <div> items, each with one <dt> and one <dd>', () => {
      const { container } = render(
        <DescriptionList>
          <DescriptionListItem label="Supplier">Contoso</DescriptionListItem>
          <DescriptionListItem label="Total">120</DescriptionListItem>
        </DescriptionList>,
      );
      const dl = container.querySelector('dl');
      expect(dl).not.toBeNull();
      const items = Array.from(dl?.children ?? []);
      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item.tagName).toBe('DIV');
        expect(Array.from(item.children).map((c) => c.tagName)).toEqual(['DT', 'DD']);
      }
      expect(screen.getByText('Supplier').tagName).toBe('DT');
      expect(screen.getByText('Contoso').tagName).toBe('DD');
    });

    it('renders an empty <dl> for zero items without errors', () => {
      const { container } = render(<DescriptionList />);
      expect(container.querySelector('dl')?.childElementCount).toBe(0);
    });

    it('accepts a node as label', () => {
      render(
        <DescriptionList>
          <DescriptionListItem label={<span data-testid="lbl">★ Rating</span>}>5</DescriptionListItem>
        </DescriptionList>,
      );
      expect(screen.getByTestId('lbl').closest('dt')).not.toBeNull();
    });
  });

  describe('layout', () => {
    // The layout lives on the ITEMS (they query the `<dl>`, their container).
    const itemClass = (layout?: 'auto' | 'inline' | 'stacked') => {
      const { container, unmount } = render(
        <DescriptionList layout={layout}>
          <DescriptionListItem label="a">b</DescriptionListItem>
        </DescriptionList>,
      );
      const cls = container.querySelector('dl > div')?.className ?? '';
      unmount();
      return cls;
    };

    it('auto (default): items are stacked, with a subgrid variant on the container query token', () => {
      for (const cls of [itemClass(), itemClass('auto')]) {
        expect(cls).toContain('@rop-description-list:grid-cols-subgrid');
        expect(cls).toContain('grid-cols-[minmax(0,1fr)]');
      }
    });

    it('inline (subgrid) and stacked (one column) force a mode with no container-query variant', () => {
      expect(itemClass('inline')).toContain('grid-cols-subgrid');
      expect(itemClass('inline')).not.toContain('@rop-description-list');
      expect(itemClass('stacked')).toContain('grid-cols-[minmax(0,1fr)]');
      expect(itemClass('stacked')).not.toContain('subgrid');
      expect(itemClass('stacked')).not.toContain('@rop-description-list');
    });

    it('the <dl> itself is the size container (no wrapper) with two columns; the threshold is a token, not a literal', () => {
      const { container } = render(<DescriptionList />);
      const dl = container.firstElementChild;
      expect(dl?.tagName).toBe('DL');
      expect(dl?.className).toContain('@container');
      expect(dl?.className).toContain('grid-cols-[fit-content(40%)_minmax(0,1fr)]');
      // The only threshold in the classes is the token variant: no px/rem literal in a query.
      expect(itemClass('auto')).not.toMatch(/\d+(px|rem)/);
      expect(itemClass('auto')).not.toMatch(/@\[|@min-\[|@max-/);
    });

    it('measures nothing with JavaScript: no ResizeObserver, no resize listener', () => {
      const observer = vi.fn();
      vi.stubGlobal('ResizeObserver', observer);
      const add = vi.spyOn(window, 'addEventListener');
      const { rerender } = render(
        <DescriptionList>
          <DescriptionListItem label="a">b</DescriptionListItem>
        </DescriptionList>,
      );
      rerender(
        <DescriptionList layout="inline">
          <DescriptionListItem label="a">c</DescriptionListItem>
        </DescriptionList>,
      );
      expect(observer).not.toHaveBeenCalled();
      expect(add.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(0);
      add.mockRestore();
      vi.unstubAllGlobals();
    });

    it('does not remount the items when layout changes', () => {
      const { rerender } = render(
        <DescriptionList layout="inline">
          <DescriptionListItem label="a">b</DescriptionListItem>
        </DescriptionList>,
      );
      const dd = screen.getByText('b');
      rerender(
        <DescriptionList layout="stacked">
          <DescriptionListItem label="a">b</DescriptionListItem>
        </DescriptionList>,
      );
      expect(screen.getByText('b')).toBe(dd);
    });
  });

  describe('empty values', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['false', false],
      ['empty array', []],
      ['empty fragment', <Fragment key="f" />],
    ])('%s renders the placeholder and the hidden label', (_name, value) => {
      render(
        <DescriptionList>
          <DescriptionListItem label="Note">{value}</DescriptionListItem>
        </DescriptionList>,
      );
      const dd = screen.getByText('Note').closest('div')?.querySelector('dd');
      expect(dd?.querySelector('[aria-hidden="true"]')).toHaveTextContent('—');
      expect(dd?.querySelector('.sr-only')).toHaveTextContent('Not specified');
    });

    it.each([
      ['0', 0, '0'],
      ['NaN', Number.NaN, 'NaN'],
      ['the string "0"', '0', '0'],
    ])('%s is a value, not an empty one', (_name, value, text) => {
      render(
        <DescriptionList>
          <DescriptionListItem label="Qty">{value}</DescriptionListItem>
        </DescriptionList>,
      );
      const dd = screen.getByText('Qty').closest('div')?.querySelector('dd');
      expect(dd).toHaveTextContent(text);
      expect(dd?.querySelector('.sr-only')).toBeNull();
    });

    it('emptyLabel and emptyPlaceholder on the list, emptyLabel on the item wins', () => {
      render(
        <DescriptionList emptyLabel="Non indicato" emptyPlaceholder="n/d">
          <DescriptionListItem label="A" />
          <DescriptionListItem label="B" emptyLabel="Mancante" />
        </DescriptionList>,
      );
      const [a, b] = Array.from(document.querySelectorAll('dd'));
      expect(a).toHaveTextContent('n/dNon indicato');
      expect(b).toHaveTextContent('n/dMancante');
    });

    it('a value that changes after mount follows the same markup (string -> node -> empty)', () => {
      const { rerender } = render(
        <DescriptionList>
          <DescriptionListItem label="V">text</DescriptionListItem>
        </DescriptionList>,
      );
      const dd = document.querySelector('dd');
      rerender(
        <DescriptionList>
          <DescriptionListItem label="V">
            <a href="#x">link</a>
          </DescriptionListItem>
        </DescriptionList>,
      );
      expect(document.querySelector('dd')).toBe(dd);
      expect(dd?.querySelector('a')).not.toBeNull();
      rerender(
        <DescriptionList>
          <DescriptionListItem label="V">{null}</DescriptionListItem>
        </DescriptionList>,
      );
      expect(dd).toHaveTextContent('—Not specified');
    });
  });

  describe('props, refs and classes', () => {
    it('does not leak non-DOM props onto the DOM', () => {
      const { container } = render(
        <DescriptionList layout="inline" emptyLabel="x" emptyPlaceholder="y" data-testid="dl">
          <DescriptionListItem label="L" emptyLabel="z" data-testid="item">
            {null}
          </DescriptionListItem>
        </DescriptionList>,
      );
      for (const el of Array.from(container.querySelectorAll('*'))) {
        for (const name of ['layout', 'label', 'emptylabel', 'emptyplaceholder']) {
          expect(el.hasAttribute(name)).toBe(false);
        }
      }
      expect(screen.getByTestId('dl').tagName).toBe('DL');
      expect(screen.getByTestId('item').tagName).toBe('DIV');
    });

    it('className wins over the defaults on the list and on the item', () => {
      render(
        <DescriptionList className="gap-y-8 max-w-xs" data-testid="dl">
          <DescriptionListItem label="a" className="items-center" data-testid="item">
            b
          </DescriptionListItem>
        </DescriptionList>,
      );
      const dl = screen.getByTestId('dl');
      expect(dl.className).toContain('gap-y-8');
      expect(dl.className).not.toContain('gap-y-3');
      expect(dl.className.split(' ')).toContain('max-w-xs');
      expect(dl.className.split(' ')).not.toContain('max-w-full');
      const item = screen.getByTestId('item');
      expect(item.className).toContain('items-center');
      expect(item.className).not.toContain('items-start');
    });

    it('forwards refs to the <dl> and to the item <div>', () => {
      const listRef = createRef<HTMLDListElement>();
      const itemRef = createRef<HTMLDivElement>();
      render(
        <DescriptionList ref={listRef}>
          <DescriptionListItem ref={itemRef} label="a">
            b
          </DescriptionListItem>
        </DescriptionList>,
      );
      expect(listRef.current?.tagName).toBe('DL');
      expect(itemRef.current?.tagName).toBe('DIV');
    });
  });

  describe('outside a list', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    it('does not throw in production (NODE_ENV replaced by the bundler): it renders the pair', () => {
      vi.stubEnv('NODE_ENV', 'production');
      render(<DescriptionListItem label="a">b</DescriptionListItem>);
      expect(screen.getByText('a').tagName).toBe('DT');
      expect(screen.getByText('b').tagName).toBe('DD');
    });

    it('throws an explicit error in development', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() => render(<DescriptionListItem label="a">b</DescriptionListItem>)).toThrow(
        /must be rendered inside a <DescriptionList>/,
      );
    });
  });
});
