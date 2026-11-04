import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { StatusBadge, type StatusBadgeTone } from './StatusBadge';

const TONES: StatusBadgeTone[] = ['neutral', 'info', 'success', 'warning', 'error'];
const Svg = () => (
  <svg data-testid="icon" viewBox="0 0 24 24">
    <path d="M0 0" />
  </svg>
);

describe('StatusBadge', () => {
  it('renders an inline <span> with the text', () => {
    render(<StatusBadge tone="warning">Archiviato</StatusBadge>);
    const badge = screen.getByText('Archiviato').closest('span[class*="inline-flex"]') as HTMLElement;
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveTextContent('Archiviato');
  });

  it('is static: no live role and no aria-live, for every tone', () => {
    const { container } = render(
      <>
        {TONES.map((tone) => (
          <StatusBadge key={tone} tone={tone}>
            {tone}
          </StatusBadge>
        ))}
      </>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('[role],[aria-live]')).toBeNull();
  });

  it('uses only token classes (no literal colours) and a distinct set per tone', () => {
    const seen = new Set<string>();
    for (const tone of TONES) {
      const { container, unmount } = render(<StatusBadge tone={tone}>x</StatusBadge>);
      const cls = (container.firstElementChild as HTMLElement).className;
      expect(cls).toContain('rounded-rop-sm');
      expect(cls).toContain('text-rop-text');
      // No box-sizing reset in the library: padding/border on the root would push it past
      // `max-width: 100%`, so the root has neither (contour = inset line, padding on children).
      for (const c of ['max-w-full', 'min-w-0', '[outline-style:solid]', '[outline-width:1px]', '-outline-offset-1']) expect(cls).toContain(c);
      expect(cls).not.toMatch(/(^|\s)(border|p[xlr]?-[^\s]+|box-border)(\s|$)/);
      expect(cls).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl|\[#/i);
      if (tone !== 'neutral') expect(cls).toContain(`bg-rop-${tone}/10`);
      seen.add(cls);
      unmount();
    }
    expect(seen.size).toBe(TONES.length);
  });

  it('defaults to neutral; an invalid tone (untyped JS) falls back to neutral without crashing', () => {
    const { container: a } = render(<StatusBadge>x</StatusBadge>);
    const neutral = (a.firstElementChild as HTMLElement).className;
    for (const bad of ['nope', 'constructor', 'toString', '__proto__', '', null, 42]) {
      const { container } = render(<StatusBadge tone={bad as never}>x</StatusBadge>);
      expect((container.firstElementChild as HTMLElement).className).toBe(neutral);
    }
  });

  describe('empty children', () => {
    it.each([null, undefined, false, '', '   ', <></>])('renders nothing (%#)', (children) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { container } = render(<StatusBadge>{children as never}</StatusBadge>);
      expect(container).toBeEmptyDOMElement();
      vi.restoreAllMocks();
    });

    // The warning flag lives for the whole module: each case imports a fresh copy of it. The
    // component uses no hooks, so a second module instance renders fine next to the test's React.
    describe('warning', () => {
      afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        vi.resetModules();
      });
      const freshBadge = async () => (await import('./StatusBadge')).StatusBadge;

      it('is logged once in development, naming the component, and not again for later empty renders', async () => {
        vi.resetModules();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const Badge = await freshBadge();
        const { rerender } = render(<Badge>{null}</Badge>);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain('StatusBadge');
        rerender(<Badge>{false}</Badge>);
        render(<Badge>{'  '}</Badge>);
        expect(warn).toHaveBeenCalledTimes(1);
      });

      it('is not logged for a badge with content', async () => {
        vi.resetModules();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const Badge = await freshBadge();
        render(<Badge>Attivo</Badge>);
        expect(warn).not.toHaveBeenCalled();
      });

      it('is not logged in production', async () => {
        vi.resetModules();
        vi.stubEnv('NODE_ENV', 'production');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const Badge = await freshBadge();
        const { container } = render(<Badge>{null}</Badge>);
        expect(container).toBeEmptyDOMElement();
        expect(warn).not.toHaveBeenCalled();
      });
    });

    it('0 is content', () => {
      render(<StatusBadge>{0}</StatusBadge>);
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('icon', () => {
    it('is decorative: wrapped in an aria-hidden node, before the text', () => {
      render(
        <StatusBadge tone="success" icon={<Svg />}>
          Attivo
        </StatusBadge>,
      );
      // The icon sits in an alignment slot (CapIconSlot, #217): the aria-hidden wrapper is the
      // slot root (`data-rop-badge-icon`), not necessarily the icon's direct parent.
      const icon = screen.getByTestId('icon');
      const wrapper = icon.closest('[data-rop-badge-icon]');
      expect(wrapper).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByRole('img')).toBeNull();
      expect(wrapper!.nextElementSibling).toHaveTextContent('Attivo');
    });

    it('no icon wrapper without icon', () => {
      const { container } = render(<StatusBadge>x</StatusBadge>);
      expect(container.querySelector('[aria-hidden]')).toBeNull();
    });
  });

  describe('props', () => {
    it('does not leak tone / icon to the DOM', () => {
      const { container } = render(
        <StatusBadge tone="error" icon={<Svg />} data-foo="1">
          x
        </StatusBadge>,
      );
      const el = container.firstElementChild as HTMLElement;
      for (const attr of ['tone', 'icon']) expect(el.hasAttribute(attr)).toBe(false);
      expect(container.innerHTML).not.toMatch(/\s(tone|icon)=/);
    });

    it('className wins over the defaults', () => {
      const { container } = render(<StatusBadge className="rounded-none py-2">x</StatusBadge>);
      const cls = (container.firstElementChild as HTMLElement).className;
      expect(cls).toContain('rounded-none');
      expect(cls).not.toContain('rounded-rop-sm');
      expect(cls).toContain('py-2');
      expect(cls).not.toContain('py-px');
    });

    it('forwards ref and HTML props', () => {
      const ref = createRef<HTMLSpanElement>();
      render(
        <StatusBadge ref={ref} id="b" title="Stato" data-testid="badge">
          x
        </StatusBadge>,
      );
      expect(ref.current).toBe(screen.getByTestId('badge'));
      expect(ref.current).toHaveAttribute('id', 'b');
      expect(ref.current).toHaveAttribute('title', 'Stato');
    });

    it('keeps the whole text in the DOM (accessible name is the full text)', () => {
      const long = 'Un testo di stato davvero molto lungo '.repeat(5).trim();
      render(<StatusBadge>{long}</StatusBadge>);
      expect(screen.getByText(long)).toBeInTheDocument();
    });

    it('a text change after mount does not create a live region', () => {
      const { rerender, container } = render(<StatusBadge>Bozza</StatusBadge>);
      rerender(<StatusBadge>Pubblicato</StatusBadge>);
      expect(container).toHaveTextContent('Pubblicato');
      expect(container.querySelector('[role],[aria-live]')).toBeNull();
    });
  });
});
