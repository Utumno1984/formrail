---
name: test-harness-spec
description: How to write an Internal/Harness fixture in Storybook to validate asynchronous states and controlled contexts of a hook — use it when you add or review a fixture in packages/core/src/internal/*.stories.tsx.
---

# Test harness: fixtures in Internal/*

Reference: `UseObjectPageFormFixture.stories.tsx`, `UseListReportFixture.stories.tsx`,
`UseComboboxFixture.stories.tsx`, `ReturnFocus.stories.tsx`, `OverlayLayers.stories.tsx`,
`GeometryFixtures.stories.tsx`, `Harness.stories.tsx` are the precedents to follow.

## What they are (and what they are not)

An `Internal/*` fixture is a minimal component, **without production styling**, that mounts a
hook (never a whole public component) and exposes its internal state through `data-testid`, so
that an e2e test can read it without depending on the markup of a real component (which can
change for visual reasons unrelated to the hook). It is never exported by the package
(`src/index.ts` does not touch it) and must never be re-exported from there.

## Asynchronous states

Simulate the delay with `setTimeout`/an explicit Promise, never a value already available on
mount: the most common bug in the consumers of a state hook (dirty-tracking, search, filter) is
telling a value that arrives **after** mount from one present from the start. An example from
the pattern already in use (`UseObjectPageFormFixture`): a "Load data" button that calls
`reset(value)` after 500ms, so a test can check that the form does NOT become dirty when the
hydration comes from an explicit gesture, and THAT it does when the user then edits a field.

## Controlled contexts

Expose both the happy path and the error path as separate actions (e.g. two buttons "Save
(ok)" / "Save (error)" that call the same hook function with a different result), not only the
case that works. The internal state that a test must be able to read (dirty, saving, error,
count, etc.) is a dedicated `data-testid` with the value rendered as plain text (`yes`/`no`, an
error message) — do not infer it from a CSS class or from an ARIA attribute meant for
accessibility, which can change independently of the state the test wants to check.

## What to check from a test against this fixture

- The state changes in the right order (e.g. `saving: true` appears before the result and
  disappears after it, regardless of success or error).
- An action repeated while an operation is already in progress (a second click on "Save" before
  the first one finishes) has the behaviour declared by the ticket (ignored, queued, etc.), not
  whatever happens because of how React scheduled the effects.
- Unmounting the component in the middle of an asynchronous operation leaves no `setState` on an
  unmounted component (no React warning in the console) nor an orphan listener/timer.
