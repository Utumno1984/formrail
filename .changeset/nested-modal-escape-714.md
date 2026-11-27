---
'@formrail/core': patch
---

`Dialog` and `Sheet` (and `ConfirmDialog`, built on them): an Escape pressed right after a panel opened above another one closes the panel on top only. Radix moves "the highest layer" off the panel underneath in a re-render React schedules as a task, one or two frames after the new panel is on screen (longer on a busy page); an Escape in that gap reached the panel underneath, which closed, and the nested one with it. The panel on top gets it now, `dismissible={false}` and its `onEscapeKeyDown` included; the one underneath stays open and its `onEscapeKeyDown` is not called. The same holds when one handler closes a panel and opens another (the Escape closes the new one, it was lost before), and wherever the focus is. "On top" is the panel mounted last, as Radix stacks its layers: a panel reopened during its exit animation stays under a panel opened after it.
