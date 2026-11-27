// #714: an Escape that arrives right after a nested dialog has opened, before Radix's layer
// bookkeeping has caught up (its "which layer is the highest" re-render is scheduled, not
// synchronous), must close the dialog on top, never the one underneath. The race only exists outside
// `act()` (which flushes all the scheduled work at once): the clicks and the key are native events
// dispatched by hand, as the browser would deliver them, and only microtasks run in between.
import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
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

/**
 * Radix's Presence keeps a panel mounted until its exit animation ends; jsdom has no animations, so
 * the panels get a (never-ending) animation name: a closed panel stays in the DOM, exiting.
 */
function simulateExitAnimations(): void {
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
    const style = original(element, pseudo);
    if (!(element instanceof HTMLElement) || !element.hasAttribute('data-state')) return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === 'animationName') return element.getAttribute('data-state') === 'open' ? 'enter' : 'exit';
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
  });
}

/** Titles of the dialogs that are open (an exiting one is in the DOM with `data-state="closed"`). */
const openDialogNames = () =>
  screen
    .queryAllByRole('dialog', { hidden: true })
    .filter((d) => d.getAttribute('data-state') === 'open')
    .map((d) => d.querySelector('h2')?.textContent);

/** A controlled dialog A with a controlled dialog B nested in it; the buttons sit outside both. */
function ControlledPair({
  onA,
  onB,
  steps,
}: {
  onA: (open: boolean) => void;
  onB: (open: boolean) => void;
  steps: Record<string, [a: boolean | null, b: boolean | null]>;
}) {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <>
      {Object.entries(steps).map(([name, [nextA, nextB]]) => (
        <button
          key={name}
          type="button"
          onClick={() => {
            if (nextA !== null) setA(nextA);
            if (nextB !== null) setB(nextB);
          }}
        >
          {name}
        </button>
      ))}
      <Dialog open={a} onOpenChange={(open) => { onA(open); setA(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Dialog open={b} onOpenChange={(open) => { onB(open); setB(open); }}>
              <DialogContent size="sm">
                <DialogHeader>
                  <DialogTitle>B</DialogTitle>
                </DialogHeader>
                <DialogBody>Nested in A.</DialogBody>
              </DialogContent>
            </Dialog>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A click on a step button (hidden from the accessibility tree while a dialog is open): a discrete event. */
const step = (name: string) => screen.getByRole('button', { name, hidden: true }).click();

describe('Dialog: Escape and panels that reopen, swap or exit (#714)', () => {
  it('a dialog reopened during its exit, with a nested dialog open: a settled Escape closes the nested one', async () => {
    simulateExitAnimations();
    const onA = vi.fn();
    const onB = vi.fn();
    render(
      <ControlledPair onA={onA} onB={onB} steps={{ 'Open B': [null, true], 'Close A': [false, null], 'Reopen A': [true, null] }} />,
    );
    await settle();
    step('Open B');
    await settle();
    step('Close A');
    await settle();
    expect(openDialogNames()).toEqual(['B']); // A is exiting, its nodes still mounted
    step('Reopen A');
    await settle();
    expect(openDialogNames()).toEqual(['A', 'B']);
    // Settled: Radix's layers are right (B mounted after A, and A never remounted). B is on top.
    pressEscape();
    await settle();
    expect(openDialogNames()).toEqual(['A']);
    expect(onB.mock.calls).toEqual([[false]]);
    expect(onA).not.toHaveBeenCalled();
  });

  it('one handler reopens an exiting dialog and opens a dialog nested in it: an Escape right away closes the nested one', async () => {
    simulateExitAnimations();
    const onA = vi.fn();
    const onB = vi.fn();
    render(<ControlledPair onA={onA} onB={onB} steps={{ 'Close A': [false, null], 'Reopen both': [true, true] }} />);
    await settle();
    step('Close A');
    await settle();
    expect(openDialogNames()).toEqual([]); // A is exiting
    // One update: A reopens (same nodes: it mounted before B) and B mounts above it.
    step('Reopen both');
    await microtasks();
    expect(openDialogNames()).toEqual(['A', 'B']);
    pressEscape();
    await settle();
    expect(openDialogNames()).toEqual(['A']);
    expect(onB.mock.calls).toEqual([[false]]);
    expect(onA).not.toHaveBeenCalled();
  });

  it('one handler closes a dialog and opens its sibling: an Escape in the first frames closes the sibling', async () => {
    simulateExitAnimations();
    const onA = vi.fn();
    const onB = vi.fn();
    function Swap() {
      const [a, setA] = useState(true);
      const [b, setB] = useState(false);
      return (
        <>
          <Dialog open={a} onOpenChange={(open) => { onA(open); setA(open); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>A</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <button type="button" onClick={() => { setA(false); setB(true); }}>
                  Swap
                </button>
              </DialogBody>
            </DialogContent>
          </Dialog>
          <Dialog open={b} onOpenChange={(open) => { onB(open); setB(open); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>B</DialogTitle>
              </DialogHeader>
              <DialogBody>The sibling.</DialogBody>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Swap />);
    await settle();
    step('Swap');
    await microtasks();
    // A is exiting and Radix still counts it as the highest layer; B is open, mounted after it.
    expect(openDialogNames()).toEqual(['B']);
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2);
    pressEscape();
    await settle();
    expect(openDialogNames()).toEqual([]);
    expect(onB.mock.calls).toEqual([[false]]);
    expect(onA).not.toHaveBeenCalled();
  });

  it('an Escape during the exit of the top dialog is not passed down to the dialog underneath', async () => {
    simulateExitAnimations();
    const first = vi.fn();
    const second = vi.fn();
    render(<Nested onFirstOpenChange={first} onSecondOpenChange={second} />);
    await openBoth();
    await settle();
    pressEscape();
    await settle();
    expect(openDialogNames()).toEqual(['First dialog']); // the second is exiting, still the highest layer
    pressEscape();
    await settle();
    // Unchanged behaviour: one dialog per press, the exiting one takes this press.
    expect(openDialogNames()).toEqual(['First dialog']);
    expect(first.mock.calls).toEqual([[true]]);
  });

  it('the race does not depend on the focus: a nested dialog that keeps the focus outside still closes alone', async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <Dialog onOpenChange={first}>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>First dialog</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Dialog onOpenChange={second}>
              <DialogTrigger>Open the second</DialogTrigger>
              <DialogContent size="sm" onOpenAutoFocus={(event) => event.preventDefault()}>
                <DialogHeader>
                  <DialogTitle>Second dialog</DialogTitle>
                </DialogHeader>
                <DialogBody>On top of the first.</DialogBody>
              </DialogContent>
            </Dialog>
          </DialogBody>
        </DialogContent>
      </Dialog>,
    );
    await openBoth();
    // The focus stayed on the opener, inside the first dialog: the Escape's target is there.
    expect(screen.getByRole('button', { name: 'Open the second', hidden: true })).toHaveFocus();
    pressEscape();
    await settle();
    expect(dialogNames()).toEqual(['First dialog']);
    expect(second.mock.calls).toEqual([[true], [false]]);
    expect(first.mock.calls).toEqual([[true]]);
  });

  it('a dialog underneath that re-renders with an inline callback ref stays underneath', async () => {
    const first = vi.fn();
    const second = vi.fn();
    let rerender: () => void = () => {};
    function Underneath() {
      const [, setCount] = useState(0);
      rerender = () => setCount((count) => count + 1);
      return (
        <Dialog onOpenChange={first}>
          <DialogTrigger>Open</DialogTrigger>
          {/* A new ref function on every render. */}
          <DialogContent ref={(node) => void node}>
            <DialogHeader>
              <DialogTitle>First dialog</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Dialog onOpenChange={second}>
                <DialogTrigger>Open the second</DialogTrigger>
                <DialogContent size="sm">
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
    render(<Underneath />);
    await openBoth();
    await settle();
    rerender();
    await settle();
    pressEscape();
    await settle();
    expect(dialogNames()).toEqual(['First dialog']);
    expect(second.mock.calls).toEqual([[true], [false]]);
    expect(first.mock.calls).toEqual([[true]]);
  });

  it('in StrictMode too, an Escape in the race closes only the dialog on top', async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <StrictMode>
        <Nested onFirstOpenChange={first} onSecondOpenChange={second} />
      </StrictMode>,
    );
    await openBoth();
    pressEscape();
    await settle();
    expect(dialogNames()).toEqual(['First dialog']);
    pressEscape();
    await settle();
    expect(dialogNames()).toEqual([]);
    expect(first.mock.calls).toEqual([[true], [false]]);
  });
});
