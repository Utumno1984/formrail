---
'@formrail/pro': patch
---

`<RebaseNotice />` follow-ups (#470):
- **Focus not obscured (WCAG 2.4.11)**: when the notice takes the top strip of the scroll container and the focused control was in it, the control is scrolled back into view. This applies to a control the user types in, and now also to any control whose focus indicator is shown (`:focus-visible`, for example a header button reached with the keyboard). The control lands below what the container keeps stuck at its top, such as a sticky Anchor Bar: until now a field brought back could stay hidden under that bar. A button pressed with a pointer shows no indicator, so the content still does not move for it.
- **Layout**: the position is recorded again when the box the notice sits in is resized from outside, for example a consumer that caps the notice's row above the virtual keyboard. Before, the next render scrolled by that move too. The scroll position the browser clamps in the relayout, at the end of the content, is no longer counted twice.
- **Docs**: `focusTargetFor` says what to return when the conflict's field is gone, for an item the server removed.

Story-only (Pro showcase "Invoices with Change Summary"):
- After "Use server value" on a line the server removed, the focus goes to the line that took its place, else to the previous line, else to "Add line" (it was left on `<body>` when the removed line was the last).
- The notice row is capped by the room that stays visible: 40% of the editor, and the scroller keeps 10rem, also above the virtual keyboard. The notice never goes below 3rem.
