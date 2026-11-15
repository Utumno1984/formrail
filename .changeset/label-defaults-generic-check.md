---
'@formrail/core': patch
'@formrail/pro': patch
---

Tests only, no type or behaviour changes: a generic test now checks that the default written in the prose of every
key of every `*Labels` interface ("Default `Next month`.") is the value of the code, in core and Pro, every value of
it when the prose lists several ("Default `Information`, `Success`, `Warning` and `Error`."), in order and in number.
To read the values, the default texts of `Calendar`, `DatePicker`, `FileUpload`, `MultiSelect`, `NumberInput`,
`Pagination` and `ToastProvider` are exported from their modules for the tests (`@internal`, not re-exported by the
package entries: nothing new is public).
