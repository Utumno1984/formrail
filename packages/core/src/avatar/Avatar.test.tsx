import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Avatar, type AvatarShape, type AvatarSize } from './Avatar';
import { getInitials } from './initials';

const img = (container: HTMLElement) => container.querySelector('img') as HTMLImageElement;
const root = (container: HTMLElement) => container.firstElementChild as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe('getInitials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['ada lovelace', 'AL'],
    ['Élodie Ünal', 'ÉÜ'],
    ['Ada', 'A'],
    ['  Ada   Byron   Lovelace ', 'AB'],
    ['Mary-Jane Watson', 'MW'],
    ['élodie ünal', 'ÉÜ'.toLocaleUpperCase()],
    ['👩‍🚀 Ada', '👩‍🚀A'],
    ['', ''],
    ['   ', ''],
  ])('%j -> %j', (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });

  it('is empty for non-strings', () => {
    expect(getInitials(undefined)).toBe('');
    expect(getInitials(null)).toBe('');
    expect(getInitials(42 as never)).toBe('');
  });

  it('falls back to code points when Intl.Segmenter is missing', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    try {
      expect(getInitials('Élodie Ünal')).toBe('ÉÜ');
      expect(getInitials('Ada Lovelace')).toBe('AL');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Avatar accessible name', () => {
  it('is a role=img named by `name`, with a single source for the name', () => {
    const { container } = render(<Avatar name="Ada Lovelace" src="/a.png" />);
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toBe(root(container));
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(img(container)).toHaveAttribute('alt', '');
    expect(img(container)).toHaveAttribute('aria-hidden', 'true');
  });

  it('decorative: no name, aria-hidden, no role', () => {
    const { container } = render(<Avatar name="Ada Lovelace" decorative />);
    expect(root(container)).toHaveAttribute('aria-hidden', 'true');
    expect(root(container)).not.toHaveAttribute('role');
    expect(root(container)).not.toHaveAttribute('aria-label');
  });

  it.each(['', '   ', undefined])('blank name %j: generic icon, no empty aria-label, console.error in dev', (name) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(<Avatar name={name} />);
    expect(root(container)).not.toHaveAttribute('aria-label');
    expect(root(container)).not.toHaveAttribute('role');
    expect(root(container)).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('[data-rop-avatar-initials]')).toBeNull();
    expect(error.mock.calls.length).toBeLessThanOrEqual(1); // once per page load
  });

  it('blank name + decorative: no error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Avatar decorative />);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('Avatar fallback and loading', () => {
  it('without src shows the initials and no <img>', () => {
    const { container } = render(<Avatar name="Élodie Ünal" />);
    expect(container.textContent).toBe('ÉÜ');
    expect(container.querySelector('img')).toBeNull();
    expect(root(container)).toHaveAttribute('data-rop-avatar-status', 'idle');
  });

  it('while loading shows the initials with the image hidden; once loaded shows the image only', () => {
    const { container } = render(<Avatar name="Ada Lovelace" src="/a.png" />);
    expect(container.textContent).toBe('AL');
    expect(img(container)).toHaveClass('invisible');
    fireEvent.load(img(container));
    expect(container.textContent).toBe('');
    expect(img(container)).toHaveClass('visible');
    expect(root(container)).toHaveAttribute('data-rop-avatar-status', 'loaded');
  });

  it('after an error shows the initials and the image stays hidden', () => {
    const { container } = render(<Avatar name="Ada Lovelace" src="/broken.png" />);
    fireEvent.error(img(container));
    expect(container.textContent).toBe('AL');
    expect(img(container)).toHaveClass('invisible');
    expect(root(container)).toHaveAttribute('data-rop-avatar-status', 'error');
  });

  it('a changed src goes back to the fallback in the same render (the old photo is never shown)', () => {
    const { container, rerender } = render(<Avatar name="Ada Lovelace" src="/a.png" />);
    fireEvent.load(img(container));
    expect(img(container)).toHaveClass('visible');
    rerender(<Avatar name="Ada Lovelace" src="/b.png" />);
    expect(img(container)).toHaveClass('invisible');
    expect(img(container)).toHaveAttribute('src', '/b.png');
    expect(container.textContent).toBe('AL');
    fireEvent.load(img(container));
    expect(img(container)).toHaveClass('visible');
  });

  it('a failed src that becomes valid shows the image', () => {
    const { container, rerender } = render(<Avatar name="Ada" src="/broken.png" />);
    fireEvent.error(img(container));
    rerender(<Avatar name="Ada" src="/ok.png" />);
    expect(root(container)).toHaveAttribute('data-rop-avatar-status', 'loading');
    fireEvent.load(img(container));
    expect(root(container)).toHaveAttribute('data-rop-avatar-status', 'loaded');
  });

  it('removing the src goes back to idle', () => {
    const { container, rerender } = render(<Avatar name="Ada" src="/a.png" />);
    fireEvent.load(img(container));
    rerender(<Avatar name="Ada" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('A');
  });

  it('an image already complete at mount is shown without the fallback flashing', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(64);
    const { container } = render(<Avatar name="Ada Lovelace" src="/cached.png" />);
    expect(root(container)).toHaveAttribute('data-rop-avatar-status', 'loaded');
    expect(container.textContent).toBe('');
    expect(img(container)).toHaveClass('visible');
  });

  it('a complete image with no width (failed before hydration) stays on the fallback', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
    const { container } = render(<Avatar name="Ada Lovelace" src="/broken.png" />);
    expect(container.textContent).toBe('AL');
  });

  it('onLoadingStatusChange reports idle, loading, loaded, error', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<Avatar name="Ada" onLoadingStatusChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith('idle');
    rerender(<Avatar name="Ada" src="/a.png" onLoadingStatusChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith('loading');
    fireEvent.load(img(container));
    expect(onChange).toHaveBeenLastCalledWith('loaded');
    rerender(<Avatar name="Ada" src="/b.png" onLoadingStatusChange={onChange} />);
    fireEvent.error(img(container));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['idle', 'loading', 'loaded', 'loading', 'error']);
  });

  it('unmounting while loading: a late event updates nothing and does not warn', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onChange = vi.fn();
    const { container, unmount } = render(<Avatar name="Ada" src="/slow.png" onLoadingStatusChange={onChange} />);
    const detached = img(container);
    unmount();
    onChange.mockClear();
    act(() => {
      detached.dispatchEvent(new Event('load'));
      detached.dispatchEvent(new Event('error'));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('Avatar sizes, shapes and props', () => {
  const sizes: [AvatarSize, string][] = [
    ['xs', 'size-6'],
    ['sm', 'size-8'],
    ['md', 'size-10'],
    ['lg', 'size-12'],
    ['xl', 'size-16'],
  ];
  it.each(sizes)('size=%s -> %s, never shrinking', (size, cls) => {
    const { container } = render(<Avatar name="Ada" size={size} />);
    expect(root(container)).toHaveClass(cls, 'shrink-0');
  });

  it('defaults to md and circle; invalid values fall back to the defaults', () => {
    const { container } = render(<Avatar name="Ada" />);
    const base = root(container).className;
    expect(base).toContain('size-10');
    expect(base).toContain('rounded-full');
    for (const bad of ['nope', 'constructor', '__proto__', null, 7]) {
      const { container: c } = render(<Avatar name="Ada" size={bad as never} shape={bad as never} />);
      expect(root(c).className).toBe(base);
    }
  });

  it.each<[AvatarShape, string]>([
    ['circle', 'rounded-full'],
    ['square', 'rounded-rop-md'],
  ])('shape=%s -> %s', (shape, cls) => {
    const { container } = render(<Avatar name="Ada" shape={shape} />);
    expect(root(container)).toHaveClass(cls);
  });

  it('uses only token classes and keeps an outline (visible in forced-colors)', () => {
    const { container } = render(<Avatar name="Ada" />);
    const cls = root(container).className;
    expect(cls).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl|\[#/i);
    for (const c of ['bg-rop-surface-subtle', 'text-rop-text', 'outline-rop-border', '[outline-style:solid]', '[outline-width:1px]', 'overflow-hidden']) {
      expect(cls).toContain(c);
    }
    expect(cls).not.toMatch(/(^|\s)(border|p[xlrytb]?-[^\s]+)(\s|$)/);
    expect(img(render(<Avatar name="Ada" src="/a.png" />).container)).toHaveClass('object-cover');
  });

  it('className wins over conflicting classes (real merge), ref is forwarded, other props pass through', () => {
    const ref = createRef<HTMLSpanElement>();
    const { container } = render(<Avatar ref={ref} name="Ada" className="size-20 rounded-none" data-testid="a" id="x" />);
    expect(ref.current).toBe(root(container));
    const cls = root(container).className;
    expect(cls).toContain('size-20');
    expect(cls).not.toContain('size-10');
    expect(cls).toContain('rounded-none');
    expect(cls).not.toContain('rounded-full');
    expect(root(container)).toHaveAttribute('data-testid', 'a');
    expect(root(container)).toHaveAttribute('id', 'x');
  });

  it('does not leak non-DOM props as attributes on the container', () => {
    const { container } = render(
      <Avatar name="Ada Lovelace" src="/a.png" size="lg" shape="square" decorative onLoadingStatusChange={() => undefined} />,
    );
    const attrs = root(container).getAttributeNames();
    for (const leaked of ['name', 'src', 'decorative', 'size', 'shape', 'onloadingstatuschange', 'onLoadingStatusChange']) {
      expect(attrs).not.toContain(leaked);
    }
  });
});

describe('Avatar SSR', () => {
  it('renders the fallback on the server and hydrates without mismatch', () => {
    const html = renderToString(<Avatar name="Ada Lovelace" src="/a.png" />);
    expect(html).toContain('>AL<');
    expect(html).toContain('role="img"');
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    return import('react-dom/client').then(({ hydrateRoot }) => {
      let r: ReturnType<typeof hydrateRoot>;
      act(() => {
        r = hydrateRoot(host, <Avatar name="Ada Lovelace" src="/a.png" />);
      });
      expect(error).not.toHaveBeenCalled();
      expect(host.textContent).toBe('AL');
      act(() => r.unmount());
      host.remove();
    });
  });
});
