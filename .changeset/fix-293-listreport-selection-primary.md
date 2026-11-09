---
'@react-object-page/core': patch
---

The List Report row selection (rest / hover / pressed) and the count flash now follow `--color-rop-primary` instead of the fixed blue scale (#293). New derived tokens `--color-rop-primary-subtle`, `--color-rop-primary-subtle-hover` and `--color-rop-primary-muted` (utilities `bg-rop-primary-subtle`, `bg-rop-primary-subtle-hover`, `border-rop-primary-muted`) use the same mix percentages as blue-50/100/300, so the default theme is unchanged.
