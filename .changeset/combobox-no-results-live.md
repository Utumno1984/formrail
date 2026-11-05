---
'@react-object-page/core': patch
---

Combobox: the "no results" state is now announced to screen readers. A visually hidden `role="status"` region (`aria-live="polite"`, `aria-atomic`) is mounted next to the input from the start; it takes the `emptyLabel` text when the open list has nothing to show and is emptied when results come back or the list closes. Keystrokes that keep the list empty leave its text untouched, so the message is announced once per entry into the state, not at every key. The disabled message option in the list is unchanged. Tests that query the message with a page-wide `getByText(emptyLabel)` now find two nodes: scope the query to the listbox (or use `getByRole('option', { name })`).
