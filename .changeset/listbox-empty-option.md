---
'@react-object-page/core': patch
---

Combobox and Select: the "no results" / `emptyLabel` message in an open list is now a disabled option (`role="option"`, `aria-disabled="true"`) instead of a bare text node, so the listbox only owns options (axe `aria-required-children`) and screen readers expose the message. It is never active, focused or selectable: arrows, Home/End, Enter and a click leave the value unchanged. Consumers of `useCombobox` should render their own empty message the same way.
