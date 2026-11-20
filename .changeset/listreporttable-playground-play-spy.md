---
---

Story-only (#579): the play of the `ListReportTable` Playground checks its two `onSortChange` calls before it updates the args (an args update restores Storybook's `fn()` spies), no longer after. No change to the published package.
