---
'@react-object-page/core': patch
---

Internal docs-coverage guard (#416): Docs page ids now follow Storybook's own sanitizer (non-ASCII letters kept), and a "part of a compound component" export counts as documented only when the page uses it in code at a word boundary, not when a comment or a longer-named sibling mentions it.
