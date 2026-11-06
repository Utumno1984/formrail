---
'@react-object-page/core': minor
---

New `Collapsible` (`CollapsibleTrigger`, `CollapsibleContent`) and `Accordion` (`AccordionItem`, `AccordionTrigger`, `AccordionContent`): disclosure buttons with `aria-expanded` / `aria-controls`, `type="single"` (with `collapsible`) and `type="multiple"`, each trigger inside a heading (`headingLevel` 2–6, default 3), arrow keys with wrap + Home/End that skip disabled items, controlled or uncontrolled without echo (`onOpenChange` / `onValueChange` only for user gestures), closed content unmounted and `inert` while it animates out, focus moved to the trigger when an open panel holding it is closed from outside, and a height animation driven by new `--motion-rop-disclosure-*` tokens that is off under `prefers-reduced-motion`. Adds the `@radix-ui/react-accordion` and `@radix-ui/react-collapsible` dependencies.
