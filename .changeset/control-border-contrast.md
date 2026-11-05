---
'@react-object-page/core': patch
---

Raise `--color-rop-border` to at least 3:1 contrast on the surface and the subtle surface (WCAG 1.4.11) so Input, Select, Combobox and the secondary Button are identifiable by their outline. The previous soft grey is kept as the new `--color-rop-border-subtle` token, now used for the ProgressBar track, Skeleton and hover tints.
