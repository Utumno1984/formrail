---
'@react-object-page/core': patch
---

Internal docs-coverage guard (#416): Docs page ids now come from Storybook's own `toId` (non-ASCII letters kept), and the automatic "part of a compound component" inference from code usage is removed: a compound component's parts count as documented only when declared explicitly in `subcomponents` of its stories file.
