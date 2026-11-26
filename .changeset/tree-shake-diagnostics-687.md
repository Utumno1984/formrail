---
'@formrail/core': patch
'@formrail/pro': patch
---

Development diagnostics no longer ship in production bundles. Every diagnostic is now guarded by an inline `process.env.NODE_ENV !== 'production'` check that contains its text, so esbuild and Vite drop the branch and the strings: a consumer's production bundle has no `[formrail]` message (it was about 17 for the three AppShell exports alone).

Behaviour changes in production builds (`NODE_ENV=production`); development and test builds are unchanged:

- `<Icon>` with a child that is not an `<svg>`, and `<Select>` with duplicate option values, no longer print their warning (they had no guard at all). The documented behaviour is the same: `<Icon>` still renders nothing, `<Select>` still keeps the first of each duplicate.
- Invariant errors (`<MenuItem>` outside `<Menu>`, `useToast()` outside `<ToastProvider>`, `useFieldControl()` outside `<Field>`, and the other misuse errors) are still thrown, but their message loses the `[formrail] ` prefix. Do not match on that prefix in production code.

The bundle budget now measures the production bundle, with baselines regenerated (every entry is lighter than, or within a few bytes of, the same measurement taken on the previous code).
