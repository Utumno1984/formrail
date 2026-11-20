---
'@formrail/core': patch
'@formrail/pro': patch
---

Copy-paste examples (#493): the `MessageStrip` example wrapper forgets its focus ring when it is removed while focused, so it comes back without a ring until it receives the focus again; the wrapper carries a `data-testid`. Every `*.example.tsx` now fits in 110 columns (long imports, props and comments are wrapped), enforced by ESLint `max-len`. Documentation and examples only, no API changes.
