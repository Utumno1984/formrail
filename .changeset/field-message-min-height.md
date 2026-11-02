---
'@react-object-page/core': minor
---

`Field`: the error line is always reserved. The Field keeps one caption line of height at the bottom (below any state reason and help text) for its error slot, with or without those, so a one-line error appearing or disappearing no longer pushes the fields below it down. A wrapped error still grows the slot. Reason and help are static descriptions and take room only while present. This adds about 20px under every Field: a Field in an inline row (e.g. next to a `Button`, aligned at the bottom) should pass the new prop `reserveMessageSpace={false}`, as the `ListReportFilterBar` search box now does.
