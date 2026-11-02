---
'@react-object-page/core': patch
---

`FieldMessage` (help, reason, error) now sits 8px below the control (was 4px), so the focus ring no longer touches the text when the control is focused (>=4px clear, WCAG 2.4.11). The reserved error slot of `Field` grows by the same 4px (one caption line + 8px), so a one-line error still moves nothing below.
