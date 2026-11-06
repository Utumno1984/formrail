---
'@react-object-page/core': minor
---

New `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`: the tablist / tab / tabpanel pattern with roving tabindex and arrow keys (Home/End, wrap, disabled tabs skipped, vertical and RTL aware), `automatic` or `manual` activation, controlled or uncontrolled without echo (`onValueChange` only for user gestures), tab widths that do not change between selected and unselected, a tab list that scrolls on its own on narrow screens (the focused tab is scrolled into view), and `keepMounted` to keep inactive panels mounted (`hidden`) so their state survives a tab change. Adds the `@radix-ui/react-tabs` dependency.
