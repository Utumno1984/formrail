---
name: dnd-virtual-table
description: Dataset/DOM index synchronisation for virtualised lists with drag-and-drop — use it when you design or implement a component that combines virtualisation and reordering (none yet in Formrail; a prerequisite before the first ticket that introduces them, see design-system-spec.md §6 Pro "advanced tables").
---

# Drag-and-drop on virtualised lists

No such component exists yet in `packages/core` (no current `ListReportTable` is virtualised or
reorderable). This skill sets the constraints **before** the first ticket introduces them,
because they are easy to get wrong on the first round and expensive to fix later.

## The underlying problem

A virtualised list renders only the visible rows and **recycles** the DOM nodes while scrolling:
the same DOM element represents a different dataset row at different times. Drag-and-drop adds a
second axis of change (the logical order of the dataset changes during the drag, before the
final commit happens). The two axes combined break any assumption that ties "visual index in the
DOM" to "index in the dataset".

## Rules

- **Stable identity, never an index**: every draggable row carries a stable key (the id of the
  data), not the render index. A drag handler that captures the index on mount and reuses it
  after a scroll/recycling of the node moves the wrong row — a silent bug, not a runtime error.
- **Visual index ≠ dataset index during the drag**: the drop point is computed from the real
  position in the viewport (coordinates, not the rendered index), converted into the index of
  the *current* dataset (which may differ from the index at `dragstart` time if the dataset
  changed under the drag, e.g. a fetch in progress). Never assume that the render order matches
  the final order.
- **No stale closure on the recycled node**: a drag/drop handler registered per row must not
  capture `props`/state by value in a closure that survives the recycling of the virtualised
  node — use a ref updated on every render or pass the id explicitly in the event, never read a
  variable captured on mount.
- **Scrolling during the drag**: if dragging near the edge of the viewport auto-scrolls, the
  computation of the drop target must resample the position on every scroll frame, not just once
  at the start of the drag.
- **e2e tests**: a synthetic `dragstart`/`dragover`/`drop` on a fixed index is not enough — the
  test must scroll the list halfway through the drag and check that the drop lands on the
  correct dataset row (by id, not by position), reusing the geometric helpers already in
  `e2e/helpers/geometry.ts` (`expectSingleScroller`, `expectNoHorizontalOverflow`) for the layout
  part.

## Visual feedback during the drag (specification, not yet implemented)

When the component is created, the dragged row and the insertion point follow the same
elevation discipline already used for the other overlays (`overlayLayer` in
`src/overlay/layers.ts`):

- **Dragged row**: raised above the other rows (a dedicated level, do not reuse
  `overlayLayer.popover`/`.modal`: the drag is not an overlay taken out of the flow, it stays
  inside the table) with a stronger shadow than the row at rest — the same family of shadow
  tokens already used on `Dialog`/`Tooltip`, one step above the `Tooltip` one.
- **Insertion line**: 2px, colour `--color-rop-blue-600` (the primary token, scale in
  `tokens.css`), not a hard-coded colour — so it follows any theme override by the consumer.
  Visible only while a drag is active, never rendered at rest (no `opacity:0` always in the DOM:
  an invisible but present element can still intercept a hit test).
