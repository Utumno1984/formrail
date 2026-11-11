---
'@react-object-page/core': patch
---

Showcase invoice line items: a quantity or unit price of 1e21 or more is now rejected (it used to pass validation and
reload as exponential text such as `1e+22`), and a line total that would reach 1e21 is not shown.
