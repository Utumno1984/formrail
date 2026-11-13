---
'@formrail/pro': patch
---

`<RebaseNotice />` follow-ups (#470):
- **Focus not obscured (WCAG 2.4.11)**: a field being typed in that the notice pushes out of the top strip of the scroll container is brought back below what the container keeps stuck at its top, such as a sticky Anchor Bar. Until now it could stay hidden under that bar. Any other focused control still does not move the content, also when reached with the keyboard. That choice is documented: SC 2.4.11 applies when a control receives the focus, and an update never moves the focus.
- **Layout**: the position is recorded again when the box the notice sits in is resized from outside, for example a consumer that caps the notice's row above the virtual keyboard. Before, the next render scrolled by that move too. The scroll position the browser clamps in the relayout, at the end of the content, is no longer counted twice.
- **Docs**: `focusTargetFor` says what to return when the conflict's field is gone, for an item the server removed.

Story-only (Pro showcase "Invoices with Change Summary"):
- After "Use server value" on a line the server removed, the focus goes to the line that took its place, else to the previous line, else to "Add line" (it was left on `<body>` when the removed line was the last).
- The notice row is capped by the room that stays visible: 40% of the editor, and the scroller keeps 10rem, also above the virtual keyboard. The notice never goes below 3rem.
