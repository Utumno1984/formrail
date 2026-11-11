---
'@formrail/core': patch
---

Stories only, no API or default change: test fixtures (`Internal/*` and the `*NoPlay` copies of documented stories) now carry an `internal` tag, and the public Storybook deploy hides them from the sidebar. They stay in the index and render by direct URL, and the local `npm run storybook` still lists everything.
