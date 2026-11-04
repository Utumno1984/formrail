---
'@react-object-page/core': minor
---

Interactive affordance (#196): a single hover convention, the `rop-hover:` Tailwind variant (published in `theme.css`), which applies only under `(hover: hover) and (pointer: fine)` and does not redefine the consumer's own `hover:`. A tap on a touch screen no longer leaves a stuck hover. Every interactive surface (Button variants, Select trigger and options, Checkbox, Switch, RadioGroup, filter pills, sortable headers, anchor bar, breadcrumb links) now has a pointer cursor, a hover state and a distinct pressed (`active:`) state; disabled, `aria-disabled`, forced and locked controls show none of them. New tokens `--color-rop-surface-pressed` and `--color-rop-error-active`.
