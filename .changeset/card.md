---
'@react-object-page/core': minor
---

`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardBody`, `CardFooter`: static compound container. `as="section"` / `as="article"` is named by its `CardTitle` through `aria-labelledby`. No `overflow: hidden` (the focus ring of children is never clipped), long unbroken text wraps, the footer actions wrap in a narrow container. Colours, border and radius come from the existing tokens.
