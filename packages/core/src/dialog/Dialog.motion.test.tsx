import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './Dialog';
import { Sheet, SheetContent, SheetTitle } from '../sheet/Sheet';

// #76. jsdom runs no CSS animation, so these tests pin the contract that does not need one: what
// the markup says (state on the wrapper, animation utilities only under `motion-safe:`, values from
// tokens) and that the focus bookkeeping is unchanged when there is nothing to wait for. The real
// animation, the exit and the focus timing are covered in `e2e/overlay-motion.spec.ts`.

afterEach(() => cleanup());
const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

describe('modal motion markup', () => {
  it('Dialog: wrapper, backdrop and panel carry the animations only under motion-safe, and the state is on the wrapper', async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Titolo</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const wrapper = dialog.parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute('data-state', 'open');
    const backdrop = wrapper.firstElementChild as HTMLElement | null; // the reporter renders nothing
    expect(backdrop).not.toBe(dialog);
    const classes = [wrapper.className, backdrop?.className ?? '', dialog.className].join(' ');
    // Every animation utility is gated: with prefers-reduced-motion there is no `animation` at all.
    for (const token of classes.split(/\s+/).filter((c) => c.includes('animate-'))) {
      expect(token, token).toMatch(/^motion-safe:/);
    }
    expect(classes).toContain('motion-safe:data-[state=open]:animate-rop-modal-in');
    expect(classes).toContain('motion-safe:data-[state=closed]:animate-rop-modal-out');
    expect(classes).toContain('motion-safe:data-[state=open]:animate-rop-overlay-in');
    expect(classes).toContain('motion-safe:data-[state=closed]:animate-rop-overlay-out');
    expect(classes).toContain('motion-safe:data-[state=closed]:animate-rop-modal-hold');
    // Durations / easing are tokens, never literals in the component (`duration-`, `ease-`, `[...ms]`).
    expect(classes).not.toMatch(/\bduration-|\bease-|\d+ms\]|animate-\[/);
    // The vertical centring `transform` is still there and is not the property being animated.
    expect(dialog.className).toContain('[transform:translateY(-50%)]');
    expect(dialog.className).toContain('[--rop-modal-from-scale:0.96]');
  });

  it('Sheet: slides from its own edge, per side', () => {
    const { rerender } = render(
      <Sheet defaultOpen>
        <SheetContent side="right">
          <SheetTitle>Titolo</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('dialog').className).toContain('[--rop-modal-from-translate:100%_0]');
    rerender(
      <Sheet defaultOpen>
        <SheetContent side="left">
          <SheetTitle>Titolo</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('dialog').className).toContain('[--rop-modal-from-translate:-100%_0]');
  });

  it('the wrapper is marked closed as soon as the open state is false (it lets the pointer through while it exits)', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <DialogContent>
          <DialogTitle>Titolo</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Apri' }));
    const wrapper = screen.getByRole('dialog').parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute('data-state', 'open');
    expect(wrapper.className).toContain('data-[state=closed]:pointer-events-none');
  });

  it('with no animation to wait for (jsdom), closing unmounts at once and the focus still returns to the opener in the next frame', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <DialogContent>
          <DialogTitle>Titolo</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const opener = screen.getByRole('button', { name: 'Apri' });
    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await nextFrame();
    expect(opener).toHaveFocus();
  });
});
