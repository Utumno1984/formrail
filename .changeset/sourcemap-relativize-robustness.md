---
'@formrail/core': patch
---

Follow-up to the 0.1.0 release (#269): the absolute-path safety net added there (`scripts/relativize-sourcemaps.mjs` and its regression test in `package-contract.test.ts`) only walked `dist/` non-recursively, ignored the sourcemap `sourceRoot` field, and the non-`.map` check only matched the exact path of the machine it was built on. Now the scan is recursive, `sourceRoot` is relativized too, and the test also flags any path-shaped absolute string, not just this checkout's own path. No change to the published files themselves — `dist/` already had no absolute paths.
