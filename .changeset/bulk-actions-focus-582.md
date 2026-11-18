---
'@formrail/pro': patch
---

`VirtualListReport`: follow-ups of the focus rule of the selection bar (#582). A bulk action that closes its `Tooltip` by force (a `TruncatedText` whose text fits again, which dispatches a `focusout` without moving the focus) keeps its tracking, so the focus is still handed to the header checkbox if that action is hidden afterwards. A control that is not shown when its tracking starts (hidden as it takes the focus, or an environment without layout) no longer leaves its observers running at rest. A focus that lands outside the bar while nothing of the bar is tracked no longer re-renders the component (zero commits while tabbing or typing through other fields). The TSDoc now states the remaining limits: a slot moved to another root is not followed, and `disabled`/`inert` on the focused control are not handled. No public API change.
