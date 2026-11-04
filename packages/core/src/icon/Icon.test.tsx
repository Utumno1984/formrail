import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { internalIcons } from '../internal/icons';
import tokensCss from '../styles/tokens.css?raw';
import * as publicApi from '../index';
import { Icon } from './Icon';

const svg = <svg data-testid="i" width="100" height="100" viewBox="0 0 10 10" />;

describe('Icon', () => {
  it('defaults to md and applies the size token class for each size', () => {
    const { rerender } = render(<Icon>{svg}</Icon>);
    expect(screen.getByTestId('i')).toHaveClass('size-(--icon-rop-md)');
    for (const size of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
      rerender(<Icon size={size}>{svg}</Icon>);
      expect(screen.getByTestId('i')).toHaveClass(`size-(--icon-rop-${size})`);
    }
  });

  it('is decorative without label: aria-hidden, focusable=false, no role', () => {
    render(<Icon>{svg}</Icon>);
    const el = screen.getByTestId('i');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveAttribute('focusable', 'false');
    expect(el).not.toHaveAttribute('role');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('with a label exposes role=img with that name and no aria-hidden', () => {
    render(<Icon label="Errore">{svg}</Icon>);
    expect(screen.getByRole('img', { name: 'Errore' })).toBe(screen.getByTestId('i'));
    expect(screen.getByTestId('i')).not.toHaveAttribute('aria-hidden');
  });

  it.each(['', '   '])('label=%j is decorative, never a nameless role=img', (label) => {
    render(<Icon label={label}>{svg}</Icon>);
    expect(screen.getByTestId('i')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('i')).not.toHaveAttribute('role');
  });

  it('label wins over an aria-hidden already set on the consumer svg', () => {
    render(
      <Icon label="Info">
        <svg data-testid="i" aria-hidden="true" />
      </Icon>,
    );
    expect(screen.getByRole('img', { name: 'Info' })).toBeInTheDocument();
    expect(screen.getByTestId('i')).not.toHaveAttribute('aria-hidden');
  });

  it('decorative wins over a stale role/aria-label on the consumer svg', () => {
    render(
      <Icon>
        <svg data-testid="i" role="img" aria-label="stale" />
      </Icon>,
    );
    expect(screen.getByTestId('i')).not.toHaveAttribute('role');
    expect(screen.getByTestId('i')).not.toHaveAttribute('aria-label');
  });

  it('label wins over an aria-labelledby (on the svg or on Icon): the name is the label', () => {
    render(
      <>
        <span id="other">Altro</span>
        <Icon label="Errore" aria-labelledby="other">
          <svg data-testid="i" aria-labelledby="other" />
        </Icon>
      </>,
    );
    expect(screen.getByRole('img', { name: 'Errore' })).toBe(screen.getByTestId('i'));
    expect(screen.queryByRole('img', { name: 'Altro' })).toBeNull();
  });

  it('a decorative icon is not reachable by keyboard (tabIndex dropped) and has no aria-labelledby', () => {
    render(
      <Icon>
        <svg data-testid="i" tabIndex={0} aria-labelledby="x" />
      </Icon>,
    );
    expect(screen.getByTestId('i')).not.toHaveAttribute('tabindex');
    expect(screen.getByTestId('i')).not.toHaveAttribute('aria-labelledby');
  });

  it('adds no margin of its own (no effect on a flex/button layout outside text)', () => {
    render(<Icon>{svg}</Icon>);
    expect(Array.from(screen.getByTestId('i').classList).filter((c) => /^-?m[xytblr]?-/.test(c))).toEqual([]);
  });

  it('a consumer className in conflict with the size wins (merge via cn)', () => {
    render(
      <Icon size="lg" className="size-4">
        {svg}
      </Icon>,
    );
    const el = screen.getByTestId('i');
    expect(el).toHaveClass('size-4');
    expect(el).not.toHaveClass('size-(--icon-rop-lg)');
  });

  it("preserves the child's className", () => {
    render(
      <Icon>
        <svg data-testid="i" className="mine" />
      </Icon>,
    );
    expect(screen.getByTestId('i')).toHaveClass('mine', 'size-(--icon-rop-md)');
  });

  it("preserves the child's ref and composes it with the forwarded one", () => {
    const childRef = createRef<SVGSVGElement>();
    const outerRef = createRef<SVGSVGElement>();
    render(
      <Icon ref={outerRef}>
        <svg ref={childRef} data-testid="i" />
      </Icon>,
    );
    expect(childRef.current).toBe(screen.getByTestId('i'));
    expect(outerRef.current).toBe(screen.getByTestId('i'));
  });

  describe('child that is not an SVG', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // The warning is emitted once per page load: a fresh module for each case.
      vi.resetModules();
    });
    afterEach(() => warn.mockRestore());

    const freshIcon = async () => (await import('./Icon')).Icon;

    it('warns and renders nothing (no crash) for an <img>', async () => {
      const FreshIcon = await freshIcon();
      const { container } = render(
        // (JSX elements are typed `ReactElement<any>`: only the runtime check can catch an <img>.)
        <FreshIcon>
          <img alt="" src="x.png" />
        </FreshIcon>,
      );
      expect(container).toBeEmptyDOMElement();
      expect(warn).toHaveBeenCalledOnce();
    });

    it('warns and renders nothing for text', async () => {
      const FreshIcon = await freshIcon();
      const { container } = render(
        // @ts-expect-error the child must be an element
        <FreshIcon>text</FreshIcon>,
      );
      expect(container).toBeEmptyDOMElement();
      expect(warn).toHaveBeenCalledOnce();
    });

    it('warns and renders nothing for a Fragment, and warns only once per page', async () => {
      const FreshIcon = await freshIcon();
      const { container } = render(
        <FreshIcon>
          <>
            <svg />
          </>
        </FreshIcon>,
      );
      expect(container).toBeEmptyDOMElement();
      render(
        <FreshIcon>
          <img alt="" />
        </FreshIcon>,
      );
      expect(warn).toHaveBeenCalledOnce();
    });
  });
});

describe('icon scale tokens', () => {
  it('xs < sm < md < lg < xl, declared in px and strictly increasing', () => {
    const px = ['xs', 'sm', 'md', 'lg', 'xl'].map((s) => {
      const m = tokensCss.match(new RegExp(`--icon-rop-${s}:\\s*(\\d+)px`));
      expect(m, `--icon-rop-${s} missing or not in px`).not.toBeNull();
      return Number(m?.[1]);
    });
    for (let i = 1; i < px.length; i += 1) expect(px[i]).toBeGreaterThan(px[i - 1] as number);
  });
});

describe('internal icons', () => {
  const names = ['close', 'chevron-down', 'check', 'info', 'success', 'warning', 'error'] as const;

  it('are exactly the expected set, square viewBox, currentColor, no hard-coded colors', () => {
    expect(Object.keys(internalIcons).sort()).toEqual([...names].sort());
    for (const name of names) {
      const { container } = render(<Icon>{internalIcons[name]}</Icon>);
      const el = container.querySelector('svg');
      const [, , w, h] = (el?.getAttribute('viewBox') ?? '').split(' ');
      expect(w, name).toBe(h);
      expect(Number(w)).toBeGreaterThan(0);
      expect(el?.outerHTML, name).toContain('currentColor');
      expect(el?.outerHTML, name).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
    }
  });

  it('are not exposed by the public entry', () => {
    const exposed = Object.keys(publicApi);
    expect(exposed).not.toContain('internalIcons');
    expect(exposed.sort()).toEqual([
      'Avatar',
      'Breadcrumb',
      'BreadcrumbItem',
      'BreadcrumbLink',
      'BreadcrumbPage',
      'Button',
      'Calendar',
      'Card',
      'CardBody',
      'CardDescription',
      'CardFooter',
      'CardHeader',
      'CardTitle',
      'Checkbox',
      'Combobox',
      'DescriptionList',
      'DescriptionListItem',
      'DescriptionListStatus',
      'Dialog',
      'DialogBody',
      'DialogClose',
      'DialogContent',
      'DialogDescription',
      'DialogFooter',
      'DialogHeader',
      'DialogTitle',
      'DialogTrigger',
      'Divider',
      'Field',
      'FieldMessage',
      'Icon',
      'Input',
      'ListReport',
      'ListReportFilterBar',
      'ListReportTable',
      'MessageStrip',
      'ObjectPage',
      'ObjectPageFooter',
      'ObjectPageHeader',
      'ObjectPageSection',
      'Pagination',
      'ProgressBar',
      'RadioGroup',
      'RadioGroupItem',
      'Select',
      'Sheet',
      'SheetBody',
      'SheetClose',
      'SheetContent',
      'SheetDescription',
      'SheetFooter',
      'SheetHeader',
      'SheetTitle',
      'SheetTrigger',
      'StatusBadge',
      'Switch',
      'Text',
      'Title',
      'ToastProvider',
      'Tooltip',
      'TooltipProvider',
      'TruncatedText',
      'ValidationProvider',
      'cn',
      'composeRefs',
      'defaultComboboxFilter',
      'getErrorSummary',
      'useCombobox',
      'useDirtyGuard',
      'useFieldControl',
      'useFocusFirstInvalidField',
      'useListReport',
      'useListReportScrollRestoration',
      'useListReportUrlState',
      'useObjectPageForm',
      'useToast',
    ]);
  });
});
