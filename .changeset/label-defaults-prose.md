---
'@formrail/core': patch
---

TSDoc of the label interfaces: every key of `ListReportTableLabels`, `PaginationLabels`, `DirtyGuardLabels`,
`FileUploadLabels` and `ToastLabels` now states its default in the prose ("Default `Retry`."), the one convention for
label keys (the Docs show `labels` as a single row without a Default column). `DescriptionList.emptyLabel` no longer
repeats in its prose the default that the Default column shows. Documentation only, no type or behaviour changes.
