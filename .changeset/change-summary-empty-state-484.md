---
'@formrail/pro': patch
---

`ChangeSummary`: the "no changes" state is now an explicit empty state (#484). It shows a decorative check icon (`aria-hidden`) next to `emptyLabel`, inside a `role="group"` named by `label` (default `Changes`, so the name no longer disappears with the list; still no live region), and the box keeps a minimum height of a summary with one change, so it does not jump when the first change appears. A blank `emptyLabel` (`""` or only whitespace) now gives the default text `No changes` instead of an empty block that would look like a summary still loading. A `className` of the consumer (`p-0`, `min-h-0`) still wins over the defaults. No other behaviour change: the texts of single values (`Empty`, `No value`, ...) are untouched.
