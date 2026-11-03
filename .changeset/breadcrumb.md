---
'@react-object-page/core': minor
---

`Breadcrumb`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`: navigation landmark with an ordered list, decorative separators (chevron mirrored in RTL, or slash), `aria-current="page"` on the current item, `asChild` links for your router, and single-line truncation of each item (real `max-width`, the current item keeps its space longest) with no horizontal page overflow. The truncated text is in a `TruncatedText`, so the focus ring of a link is never clipped and the tooltip only appears on a real hover.
