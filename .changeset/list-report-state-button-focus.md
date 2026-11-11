---
'@formrail/core': patch
---

ListReportTable / ListReport: "Retry" (error state) and "Clear filters" (no-results state) keep the focus
on the button while the state, and so the button, stays. The focus moves to the table container only when the
button goes away with its state (right away or later, e.g. after an async reload), and never takes back a focus
the callback moved elsewhere. Before, it always jumped to the container, whose focus ring then framed the whole
table (#307).
