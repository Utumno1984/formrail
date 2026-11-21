---
'@formrail/core': minor
---

New `AppShell` (with `AppShellHeader`, `AppShellNav`, `AppShellNavLink`, `AppShellMain` and their props, plus
`AppShellLabels`): the frame of an app in a product made of several apps. A `<header>` across the top with three
parts (`start`, `center`, `end`) whose height never depends on what they hold (`--rop-app-shell-header-height`,
default 3.5rem), a named navigation column (`--rop-app-shell-nav-width`, default 16rem) shown from 64rem and not
displayed below, and a `<main>` that is the only scroller of a plain page; a List Report or an Object Page placed in
it fills it and scrolls by itself. The shell takes the dynamic viewport height (`fill="viewport"`, the default) or
its parent's (`fill="parent"`); the document itself never scrolls. A "Skip to content" link is the first Tab stop
and moves the focus to the content without touching the URL. `AppShellNavLink` is a real link (a plain click or
Enter goes to `onNavigate`, a modified click opens a new tab), a button without an `href`, or your router's link
with `asChild`; `active` sets `aria-current="page"` with a marker that is not only a colour, `disabled` keeps its
place and focus stop. The virtual keyboard of a focused `Field` is counted once, by the content, which ends above it (its bottom
border); a padding you give `AppShellMain` (`style` or a class) is kept whole beside it. The shell adds no
layer of its own: dialogs, popovers and toasts stay above the header.
