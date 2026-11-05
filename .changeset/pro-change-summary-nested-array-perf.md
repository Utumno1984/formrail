---
'@react-object-page/pro': patch
---

`computeChangeSummary`: diffing arrays nested thousands of levels deep is now linear instead of quadratic in the depth (10000 levels: about 3s down to under 100ms). The result is unchanged.
