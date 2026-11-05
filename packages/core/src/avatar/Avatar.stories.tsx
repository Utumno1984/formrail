import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Avatar, type AvatarProps, type AvatarShape, type AvatarSize } from './Avatar';

const SIZES: AvatarSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
const SHAPES: AvatarShape[] = ['circle', 'square'];
const SOURCES = ['image ok', 'slow', 'broken', 'none'] as const;
type Source = (typeof SOURCES)[number];

// Local, deterministic asset (an inline SVG, 1:2 aspect on purpose so that `object-fit: cover`
// is visible): no network, identical in every environment.
const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="192" viewBox="0 0 96 192"><rect width="96" height="192" fill="#0a6ed1"/><circle cx="48" cy="72" r="28" fill="#fff"/><rect x="12" y="112" width="72" height="80" rx="36" fill="#fff"/></svg>',
)}`;
const BROKEN = '/__avatar-missing-image__.png';
const SLOW_MS = 1500;

interface DemoArgs extends AvatarProps {
  /** Which image the demo requests (story-only control). */
  source: Source;
}

/** "slow": the image is requested only after a delay, so initials show first. */
function useDemoSrc(source: Source, src: string | undefined): string | undefined {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (source !== 'slow') return undefined;
    const timer = setTimeout(() => setReady(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [source, src]);
  const url = src && src !== '' ? src : PHOTO;
  if (source === 'image ok') return url;
  if (source === 'slow') return ready ? url : undefined;
  if (source === 'broken') return BROKEN;
  return undefined;
}

function Demo({ source, src, ...args }: DemoArgs) {
  const [broken, setBroken] = useState(false);
  const resolved = useDemoSrc(broken ? 'broken' : source, src);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Avatar {...args} src={resolved} data-testid="avatar" />
      <button type="button" onClick={() => setBroken(true)}>
        Break the image
      </button>
    </div>
  );
}

const meta = {
  title: 'Primitives/Avatar',
  component: Avatar,
  parameters: { layout: 'padded' },
  argTypes: {
    name: { control: 'text' },
    src: { control: 'text', description: 'Image URL (empty: the local sample photo)' },
    size: { control: 'radio', options: SIZES },
    shape: { control: 'radio', options: SHAPES },
    decorative: { control: 'boolean' },
    source: { control: 'select', options: SOURCES, description: 'Demo only: what the image request does' },
    onLoadingStatusChange: { action: 'onLoadingStatusChange' },
    className: { control: false },
  },
  args: {
    name: 'Ada Lovelace',
    src: '',
    size: 'md',
    shape: 'circle',
    decorative: false,
    source: 'image ok',
    onLoadingStatusChange: fn(),
  },
  render: (args) => <Demo {...args} />,
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

const box = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height };
};

/** Controls: name, src, size, shape, decorative, image behaviour (no play function: free to drive). */
export const Playground: Story = {};

/**
 * The play function waits for the photo, then clicks "Break the image" (the `src` changes to a URL
 * that fails): the initials come back, the status goes through `loading` to `error`, and the box
 * keeps its exact size.
 */
export const BreakingImage: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const avatar = canvas.getByTestId('avatar');
    await waitFor(() => expect(avatar).toHaveAttribute('data-rop-avatar-status', 'loaded'));
    await expect(avatar).toHaveAccessibleName('Ada Lovelace');
    await expect(avatar).toHaveTextContent('');
    const before = box(avatar);
    await userEvent.click(canvas.getByRole('button', { name: 'Break the image' }));
    await waitFor(() => expect(avatar).toHaveAttribute('data-rop-avatar-status', 'error'));
    await expect(avatar).toHaveTextContent('AL');
    const after = box(avatar);
    await expect(Math.abs(after.w - before.w)).toBeLessThanOrEqual(0.5);
    await expect(Math.abs(after.h - before.h)).toBeLessThanOrEqual(0.5);
    await waitFor(() => expect(args.onLoadingStatusChange).toHaveBeenLastCalledWith('error'));
    await expect(args.onLoadingStatusChange).toHaveBeenCalledWith('loaded');
  },
};

const stack = { display: 'grid', gap: 16, color: 'var(--color-rop-text)' } as const;
const row = { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' } as const;

/**
 * Visual matrix: every size x shape for initials, generic icon and image, plus a decorative avatar
 * next to a written name and a failed image. Photographed once every image has loaded.
 */
export const Overview: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={stack}>
      {SHAPES.map((shape) => (
        <section key={shape} aria-label={shape} style={stack}>
          <div style={row} data-testid={`initials-${shape}`}>
            {SIZES.map((size) => (
              <Avatar key={size} name="Élodie Ünal" size={size} shape={shape} data-testid={`initials-${shape}-${size}`} />
            ))}
          </div>
          <div style={row} data-testid={`icon-${shape}`}>
            {SIZES.map((size) => (
              <Avatar key={size} decorative size={size} shape={shape} data-testid={`icon-${shape}-${size}`} />
            ))}
          </div>
          <div style={row} data-testid={`image-${shape}`}>
            {SIZES.map((size) => (
              <Avatar key={size} name="Ada Lovelace" src={PHOTO} size={size} shape={shape} data-testid={`image-${shape}-${size}`} />
            ))}
          </div>
        </section>
      ))}
      <div style={row}>
        <Avatar decorative name="Ada Lovelace" data-testid="decorative" />
        <span>Ada Lovelace</span>
        <Avatar name="Grace Hopper" src={BROKEN} data-testid="broken" />
        <Avatar name="Single" size="lg" shape="square" data-testid="one-word" />
      </div>
      <div data-testid="narrow" style={{ display: 'flex', width: 16, outline: '1px dashed var(--color-rop-border)' }}>
        <Avatar name="Narrow Cell" data-testid="narrow-avatar" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const pending = canvasElement.querySelectorAll('[data-rop-avatar-status="loading"]');
      if (pending.length > 0) throw new Error(`${pending.length} avatars still loading`);
    });
  },
};
