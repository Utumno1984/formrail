---
'@formrail/core': patch
---

`Menu`: opened with a click (or a tap) on its trigger while another control had the focus, the menu now returns the focus to its trigger when it closes (Escape, a chosen item), not to that other control. A pointer press on the trigger does not move the focus to it, so the control focused before the press was taken as the opener. Unchanged: opened from the keyboard the focus returns to the trigger as before; opened from the `open` state it returns to the element that had it; an item that opens a `Dialog` leaves the focus in the Dialog; Tab still moves on from the trigger.
