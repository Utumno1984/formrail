---
---

Story-only (#527): "Showcase/Invoices" (the Free showcase of the invoices) is removed; "Showcase/Record editing" (sales orders and customers) takes its place and the old story ids redirect to it. The showcase router no longer has a special default module: every module writes its own `module` and list parameters (the URLs of the orders and the customers do not change). No change to the published packages.
