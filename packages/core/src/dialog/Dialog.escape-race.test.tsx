// #714: an Escape that arrives right after a nested dialog has opened, before Radix's layer
// bookkeeping has caught up (its "which layer is the highest" re-render is scheduled, not
// synchronous), must close the dialog on top, never the one underneath. The race only exists outside
// `act()` (which flushes all the scheduled work at once): the clicks and the key are native events
// dispatched by hand, as the browser would deliver them, and only microtasks run in between.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './Dialog';

const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeEach(() => {
  actEnv.IS_REACT_ACT_ENVIRONMENT = false;
});

afterEach(() => {
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  cleanup();
  vi.restoreAllMocks();
});

/** Lets React run its microtask-scheduled sync work, and nothing scheduled as a task. */
async function microtasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Runs everything React and Radix scheduled as tasks (the layer re-render, its effects, their timers). */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

function Nested({
  onFirstOpenChange,
  onSecondOpenChange,
  onSecondEscape,
  onFirstEscape,
  secondDismissible = true,
}: {
  onFirstOpenChange?: (open: boolean) => void;
  onSecondOpenChange?: (open: boolean) => void;
  onSecondEscape?: (event: KeyboardEvent) => void;
  onFirstEscape?: (event: KeyboardEvent) => void;
  secondDismissible?: boolean;
}) {
  return (
    <Dialog onOpenChange={onFirstOpenChange}>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent onEscapeKeyDown={onFirstEscape}>
        <DialogHeader>
          <DialogTitle>First dialog</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Dialog onOpenChange={onSecondOpenChange}>
            <DialogTrigger>Open the second</DialogTrigger>
            <DialogContent size="sm" onEscapeKeyDown={onSecondEscape} dismissible={secondDismissible}>
              <DialogHeader>
                <DialogTitle>Second dialog</DialogTitle>
              </DialogHeader>
              <DialogBody>On top of the first.</DialogBody>
            </DialogContent>
          </Dialog>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** Titles of the dialogs in the DOM, in document order (the first one is `aria-hidden` under the second). */
const dialogNames = () => screen.queryAllByRole('dialog', { hidden: true }).map((d) => d.querySelector('h2')?.textContent);

async function openBoth(): Promise<void> {
  screen.getByRole('button', { name: 'Open' }).click();
  await settle();
  expect(dialogNames()).toEqual(['First dialog']);
  screen.getByRole('button', { name: 'Open the second' }).click();
  await microtasks();
  // The second dialog is on screen (and has the focus) ...
  expect(dialogNames()).toEqual(['First dialog', 'Second dialog']);
}

describe('Dialog: Escape right after a nested dialog opened (#714)', () => {
  it('closes only the dialog on top, and the next Escape closes the first', async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(<Nested onFirstOpenChange={first} onSecondOpenChange={second} />);
    await openBoth();
    // ... but Radix still counts the first one as the highest layer: the Escape is pressed now.
    pressEscape();
    await settle();
    expect(dialogNames()).toEqual(['First dialog']);
    expect(second.mock.calls).toEqual([[true], [false]]);
    expect(first.mock.calls).toEqual([[true]]);
    pressEscape();
    await settle();
    expect(dialogNames()).toEqual([]);
    expect(first.mock.calls).toEqual([[true], [false]]);
  });

  it("calls the top dialog's onEscapeKeyDown once and never the first's; its preventDefault keeps both open", async () => {
    const firstEscape = vi.fn();
    const secondEscape = vi.fn((event: KeyboardEvent) => event.preventDefault());
    render(<Nested onFirstEscape={firstEscape} onSecondEscape={secondEscape} />);
    await openBoth();
    pressEscape();
    await settle();
    expect(dialogNames()).toEqual(['First dialog', 'Second dialog']);
    expect(secondEscape).toHaveBeenCalledTimes(1);
    expect(firstEscape).not.toHaveBeenCalled();
  });

  it('a top dialog with dismissible={false} stays open, and so does the first', async () => {
    const secondEscape = vi.fn();
    render(<Nested secondDismissible={false} onSecondEscape={secondEscape} />);
    await openBoth();
    pressEscape();
    await settle();
    expect(dialogNames()).toEqual(['First dialog', 'Second dialog']);
    expect(secondEscape).toHaveBeenCalledTimes(1);
  });

  it('once the layers have settled, Escape behaves as before (one dialog per press)', async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(<Nested onFirstOpenChange={first} onSecondOpenChange={second} />);
    await openBoth();
    await settle();
    pressEscape();
    await settle();
    expect(dialogNames()).toEqual(['First dialog']);
    expect(second.mock.calls).toEqual([[true], [false]]);
    expect(first.mock.calls).toEqual([[true]]);
  });
});
