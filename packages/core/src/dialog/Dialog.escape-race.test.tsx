// #714: an Escape that arrives right after a nested dialog has opened, before Radix's layer
// bookkeeping has caught up (its "which layer is the highest" re-render is scheduled, not
// synchronous), must close the dialog on top, never the one underneath. The race only exists outside
// `act()` (which flushes all the scheduled work at once): the clicks and the key are native events
// dispatched by hand, as the browser would deliver them, and only microtasks run in between.
import { cleanup, render, screen } from '@testing-library/react';
import { Activity, Fragment, StrictMode, Suspense, useState } from 'react';
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

/** A dialog never closes by itself here: `onOpenChange` reports to the spy and updates the state. */
function Panel({
  name,
  open,
  setOpen,
  onOpenChange,
  onEscape,
}: {
  name: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onEscape: (event: KeyboardEvent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); setOpen(next); }}>
      <DialogContent onEscapeKeyDown={onEscape}>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>
        <DialogBody>{name}, a sibling of the other dialog.</DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const neverSettles = new Promise<never>(() => {});
/** Suspends its `<Suspense>` boundary while `when` is true (not in a transition: the content is hidden). */
function SuspendWhen({ when }: { when: boolean }): null {
  if (when) throw neverSettles;
  return null;
}

/**
 * Dialog A, open, inside a boundary that can hide it (or remount it) and show it again with the same
 * dialog state; dialog B, a sibling outside that boundary, opened while A is hidden.
 */
function Boundaries({
  boundary,
  spies,
}: {
  boundary: 'activity' | 'suspense' | 'key';
  spies: { onA: (open: boolean) => void; onB: (open: boolean) => void; escA: () => void; escB: () => void };
}) {
  const [hidden, setHidden] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const panelA = <Panel name="A" open={a} setOpen={setA} onOpenChange={spies.onA} onEscape={spies.escA} />;
  return (
    <>
      <button type="button" onClick={() => setHidden(true)}>Hide</button>
      <button type="button" onClick={() => setHidden(false)}>Show</button>
      <button type="button" onClick={() => setB(true)}>Open B</button>
      <button type="button" onClick={() => setGeneration((g) => g + 1)}>Remount A</button>
      {boundary === 'activity' ? (
        <Activity mode={hidden ? 'hidden' : 'visible'}>{panelA}</Activity>
      ) : boundary === 'suspense' ? (
        <Suspense fallback={null}>
          <SuspendWhen when={hidden} />
          {panelA}
        </Suspense>
      ) : (
        <Fragment key={generation}>{panelA}</Fragment>
      )}
      <Panel name="B" open={b} setOpen={setB} onOpenChange={spies.onB} onEscape={spies.escB} />
    </>
  );
}

/** The dialog Radix counts as its highest layer at rest: the only one it leaves `pointer-events: auto`. */
function radixHighest(): string | undefined {
  return screen
    .queryAllByRole('dialog', { hidden: true })
    .filter((d) => d.getAttribute('data-state') === 'open' && d.style.pointerEvents === 'auto')
    .map((d) => d.querySelector('h2')?.textContent ?? '')
    .join(',');
}

describe('Dialog: Escape when Radix moves a layer to the top of an existing node (#714)', () => {
  const spies = () => ({ onA: vi.fn(), onB: vi.fn(), escA: vi.fn(), escB: vi.fn() });

  // A hidden and shown again (Activity, a re-suspended Suspense) re-runs Radix's effects on the same
  // node: Radix unregisters A's layer and registers it again, on top of B. A remount (`key`) gives A
  // new nodes, registered on top of B too. Either way A is Radix's highest layer and has the focus.
  const cases = [
    ['an <Activity> hidden and shown again', 'activity', 'Show'],
    ['a <Suspense> that suspended and showed its content again', 'suspense', 'Show'],
    ['a parent whose key changed', 'key', 'Remount A'],
  ] as const;

  for (const [label, boundary, reveal] of cases) {
    for (const strict of [false, true]) {
      const mode = strict ? ' (StrictMode)' : '';
      const mount = (s: ReturnType<typeof spies>) =>
        render(strict ? <StrictMode><Boundaries boundary={boundary} spies={s} /></StrictMode> : <Boundaries boundary={boundary} spies={s} />);

      it(`${label}${mode}: a settled Escape closes A, the dialog Radix put on top, and not B`, async () => {
        const s = spies();
        mount(s);
        await settle();
        if (boundary !== 'key') step('Hide');
        await settle();
        step('Open B');
        await settle();
        step(reveal);
        await settle();
        // In DOM order (a remounted A comes after B in the body).
        expect(openDialogNames()).toEqual(boundary === 'key' ? ['B', 'A'] : ['A', 'B']);
        expect(radixHighest()).toBe('A');
        expect(document.activeElement?.closest('[role="dialog"]')?.querySelector('h2')?.textContent).toBe('A');
        pressEscape();
        await settle();
        expect(openDialogNames()).toEqual(['B']);
        expect(s.onA.mock.calls).toEqual([[false]]);
        expect(s.escA).toHaveBeenCalledTimes(1);
        expect(s.onB.mock.calls).toEqual([]);
        expect(s.escB).not.toHaveBeenCalled();
        // B is the highest layer now: the next Escape is B's.
        pressEscape();
        await settle();
        expect(openDialogNames()).toEqual([]);
        expect(s.onB.mock.calls).toEqual([[false]]);
        expect(s.escA).toHaveBeenCalledTimes(1);
      });

      it(`${label}${mode}: an Escape right after A is back closes A once, and not B`, async () => {
        const s = spies();
        mount(s);
        await settle();
        if (boundary !== 'key') step('Hide');
        await settle();
        step('Open B');
        await settle();
        step(reveal);
        await microtasks();
        pressEscape();
        await settle();
        expect(openDialogNames()).toEqual(['B']);
        expect(s.onA.mock.calls).toEqual([[false]]);
        expect(s.escA).toHaveBeenCalledTimes(1);
        expect(s.onB.mock.calls).toEqual([]);
        expect(s.escB).not.toHaveBeenCalled();
      });
    }
  }
});

describe('Dialog: dialogs mounted open in the same commit (#714)', () => {
  // Radix registers the layers of one commit in the order of its effects (children first, then
  // siblings in order): a nested dialog above its parent, a later sibling above an earlier one. The
  // Escape goes to the dialog Radix leaves `pointer-events: auto`.
  function SameCommit({ nested, spies }: { nested: boolean; spies: { onA: (o: boolean) => void; onB: (o: boolean) => void } }) {
    const [a, setA] = useState(true);
    const [b, setB] = useState(true);
    const panelB = <Panel name="B" open={b} setOpen={setB} onOpenChange={spies.onB} onEscape={() => {}} />;
    return (
      <>
        <Dialog open={a} onOpenChange={(next) => { spies.onA(next); setA(next); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>A</DialogTitle>
            </DialogHeader>
            <DialogBody>{nested ? panelB : 'A, under B.'}</DialogBody>
          </DialogContent>
        </Dialog>
        {nested ? null : panelB}
      </>
    );
  }

  for (const nested of [true, false]) {
    it(`${nested ? 'B nested in A' : 'B a later sibling of A'}: Escape closes B first, then A`, async () => {
      const s = { onA: vi.fn(), onB: vi.fn() };
      render(<SameCommit nested={nested} spies={s} />);
      await microtasks();
      pressEscape();
      await settle();
      expect(openDialogNames()).toEqual(['A']);
      expect(radixHighest()).toBe('A');
      expect(s.onB.mock.calls).toEqual([[false]]);
      expect(s.onA.mock.calls).toEqual([]);
      pressEscape();
      await settle();
      expect(openDialogNames()).toEqual([]);
      expect(s.onA.mock.calls).toEqual([[false]]);
    });
  }
});

describe('Dialog: Escape when the top dialog closed before Radix caught up (#714)', () => {
  it('a dialog opened and closed at once, still exiting: an Escape in the race is not passed down to the one underneath', async () => {
    simulateExitAnimations();
    const onA = vi.fn();
    const onB = vi.fn();
    const escA = vi.fn();
    const escB = vi.fn();
    // B's state lives in its own component, so A never re-renders: only Radix's scheduled update
    // would move its idea of the highest layer off A.
    function BHost() {
      const [b, setB] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setB(true)}>Open B</button>
          <button type="button" onClick={() => setB(false)}>Close B</button>
          <Panel name="B" open={b} setOpen={setB} onOpenChange={onB} onEscape={escB} />
        </>
      );
    }
    function App() {
      const [a, setA] = useState(true);
      return (
        <>
          <Panel name="A" open={a} setOpen={setA} onOpenChange={onA} onEscape={escA} />
          <BHost />
        </>
      );
    }
    render(<App />);
    await settle();
    step('Open B');
    await microtasks();
    step('Close B');
    await microtasks();
    expect(openDialogNames()).toEqual(['A']);
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2);
    pressEscape();
    await settle();
    // As at rest (see "an Escape during the exit of the top dialog"): the exiting B takes the press.
    expect(openDialogNames()).toEqual(['A']);
    expect(onA).not.toHaveBeenCalled();
    expect(escA).not.toHaveBeenCalled();
    expect(escB).toHaveBeenCalledTimes(1);
  });
});

describe("Dialog: a redirected Escape uses the top dialog's current props (#714)", () => {
  type Item = { id: string; locked: boolean };
  // A list page in dialog A: "Edit" opens the editor B (nested in A) for that item. B's props depend on
  // the item being edited, a state set after B's root and panel mounted (closed).
  function Editor({ item, closed, escaped }: { item: Item; closed: (id?: string) => void; escaped: (id?: string) => void }) {
    const [editing, setEditing] = useState<Item | null>(null);
    return (
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <button type="button" onClick={() => setEditing(item)}>Edit</button>
            <Dialog
              open={editing !== null}
              onOpenChange={(open) => {
                if (!open) {
                  closed(editing?.id);
                  setEditing(null);
                }
              }}
            >
              <DialogContent size="sm" dismissible={!editing?.locked} onEscapeKeyDown={() => escaped(editing?.id)}>
                <DialogHeader>
                  <DialogTitle>B</DialogTitle>
                </DialogHeader>
                <DialogBody>Editing {editing?.id}</DialogBody>
              </DialogContent>
            </Dialog>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }

  for (const race of [true, false]) {
    const when = race ? 'an Escape right after it opened' : 'a settled Escape';
    const open = async () => {
      await settle();
      step('Edit');
      await (race ? microtasks() : settle());
      expect(openDialogNames()).toEqual(['A', 'B']);
    };

    it(`${when}: the editor's onEscapeKeyDown and onOpenChange see the item being edited`, async () => {
      const closed = vi.fn();
      const escaped = vi.fn();
      render(<Editor item={{ id: 'item-7', locked: false }} closed={closed} escaped={escaped} />);
      await open();
      pressEscape();
      await settle();
      expect(openDialogNames()).toEqual(['A']);
      expect(escaped.mock.calls).toEqual([['item-7']]);
      expect(closed.mock.calls).toEqual([['item-7']]);
    });

    it(`${when}: an editor opened on a locked item (dismissible={false}) stays open`, async () => {
      const closed = vi.fn();
      const escaped = vi.fn();
      render(<Editor item={{ id: 'item-8', locked: true }} closed={closed} escaped={escaped} />);
      await open();
      pressEscape();
      await settle();
      expect(openDialogNames()).toEqual(['A', 'B']);
      expect(escaped.mock.calls).toEqual([['item-8']]);
      expect(closed).not.toHaveBeenCalled();
    });
  }
});
