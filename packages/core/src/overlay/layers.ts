/**
 * Overlay levels mapped onto the z-index tokens of `styles/tokens.css`
 * (sticky < overlay < modal < popover < toast < tooltip). Internal: overlay wrappers take their
 * stacking from here and never write a literal z-index, so a popover is always above a modal and a
 * tooltip above both. A toast sits between popover and tooltip: one shown before a modal or a
 * popover opens must not end up under it (a lost message), while the tiny pointer-bound tooltip
 * (e.g. the one on a toast's close button) stays above it.
 *
 * The class names are written out in full on purpose: the CSS build scans the sources for
 * utilities, a name assembled at run time would never be generated.
 *
 * Radix content positioned by `@radix-ui/react-popper` (Popover, Select, Tooltip...) lives inside
 * a wrapper element that copies the computed z-index of the content: the class goes on the content
 * element and the wrapper then gets the same level. Popper reads that z-index **once**, when the
 * content mounts: the level class must already be applied (with the CSS loaded) at mount and the
 * level cannot change while the content is mounted (remount it, e.g. with a `key`). Otherwise the
 * `position: fixed` wrapper keeps an automatic z-index, still creates a stacking context, and traps
 * the content under a modal.
 */
export const overlayLayer = {
  backdrop: 'z-rop-overlay',
  modal: 'z-rop-modal',
  popover: 'z-rop-popover',
  toast: 'z-rop-toast',
  tooltip: 'z-rop-tooltip',
} as const;

export type OverlayLayer = keyof typeof overlayLayer;

/**
 * The level of in-flow sticky content (a table header, a sticky bar): above the page content and
 * below every overlay. Kept apart from `overlayLayer` because it is not an overlay.
 */
export const stickyLayer = 'z-rop-sticky';
