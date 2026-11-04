// Class names of the Object Page layout, kept apart from its logic. Full literals on purpose, and no
// bare utility name in a comment (the CSS build scans the sources, comments included).

// A flex column that takes the height of its parent: the parent's when it has one, the content's when
// it does not (the document then scrolls: still one scroller). The zero minimum height lets the scroll
// area shrink and scroll instead of pushing the footer slot out.
export const rootClass = 'flex h-full min-h-0 min-w-0 max-w-full flex-col font-rop-sans text-rop-body text-rop-text';

// The one scroller: header and sections scroll together inside it. A single-column grid with a zero
// minimum column width: a wide child scrolls inside its own section, never widens the page.
export const scrollerClass =
  'grid min-h-0 flex-1 grid-cols-1 content-start gap-6 overflow-y-auto overflow-x-hidden px-4 pt-4 sm:px-6 ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:[outline-offset:-2px]';

// Room below the last section: the virtual keyboard's height (published by Field) plus a margin, so the
// last field can be scrolled above the keyboard.
export const scrollerStyle = { paddingBottom: 'calc(var(--rop-keyboard-inset, 0px) + 1rem)' } as const;

// Where the footer goes. Never inside the scroller; empty (zero height) until a footer is mounted.
export const footerSlotClass = 'shrink-0';

// The footer is always there (hidden, it only turns invisible), so the room below the scroller never
// changes. The component-owned variable `--rop-object-page-footer-height` (3.5rem, declared on the footer
// itself, overridable with a `className`) is the declared height of the actions row; the 1px border
// comes on top of it (the library sets no box-sizing). From 640px the row is the whole footer;
// below it a message row of fixed height (2rem) sits above the actions, which share the row in equal
// columns.
export const footerClass =
  '[--rop-object-page-footer-height:3.5rem] flex min-w-0 flex-col border-t border-rop-border bg-rop-surface px-4 ' +
  'font-rop-sans text-rop-body text-rop-text ' +
  'sm:h-(--rop-object-page-footer-height) sm:flex-row sm:items-center sm:gap-4 sm:px-6';
export const footerHiddenClass = 'invisible';
export const footerMessageClass = 'flex h-8 min-w-0 items-center gap-2 sm:h-auto sm:flex-1';
export const footerActionsClass =
  'grid h-(--rop-object-page-footer-height) auto-cols-fr grid-flow-col items-center gap-2 [&>*]:min-w-0 ' +
  'sm:flex sm:h-auto sm:shrink-0 sm:justify-end';
export const footerTruncatedClass =
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:[outline-offset:-2px]';
export const footerToneIconClass = {
  info: 'text-rop-info',
  success: 'text-rop-success',
  error: 'text-rop-error',
} as const;

// Title (and status) above, actions below on a narrow screen; side by side from 640px.
export const headerClass = 'flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4';
export const headerIdentityClass = 'flex min-w-0 flex-col gap-1';
export const headerTitleRowClass = 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1';
// A very long title wraps; it is never truncated (it is the identity of the object).
export const headerTitleClass = 'min-w-0 [overflow-wrap:anywhere]';
// The title takes the focus when the footer hides with the focus inside it (programmatic, so the
// focus indicator shows only after a keyboard gesture).
export const headerTitleFocusClass =
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:[outline-offset:2px]';
export const headerSubtitleClass = 'min-w-0 text-rop-text-muted [overflow-wrap:anywhere]';
export const headerActionsClass = 'flex min-w-0 flex-wrap items-center gap-2';

// Sections stop below whatever the Anchor Bar will pin at the top (it sets the variable).
export const sectionClass = 'flex min-w-0 flex-col gap-3';
// A section stops this many px below the bar, so the focus indicator of its title (2px wide, 2px away)
// is not hidden under the bar.
// A plain literal (not built from the constant): a string built at load time is kept in the bundle of
// every export; a unit test pins the two together.
export const SECTION_GAP_PX = 4;
export const sectionStyle = { scrollMarginTop: 'calc(var(--rop-object-page-sticky-offset, 0px) + 4px)' } as const;
export const sectionTitleClass = 'min-w-0 [overflow-wrap:anywhere]';
// A wide child (a table) scrolls inside the section body, not the page. An overflow container clips on
// every side, so it gets 4px of padding (cancelled by the negative margin): the focus indicator, drawn
// up to 4px outside a control that fills the body, must not be cut.
export const sectionBodyClass = 'min-w-0 -m-1 overflow-x-auto p-1';

// Keyboard focus lands on a section title after an Anchor Bar jump (programmatic, so the focus indicator shows
// only when the jump came from the keyboard).
export const sectionTitleFocusClass =
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:[outline-offset:2px]';

// The Anchor Bar: first child of the scroller, pinned at its top (the negative margins cancel the
// scroller's padding so it spans the full width and sits flush at the top; a sticky offset is measured
// from the padding edge of the scroller, hence the negative one). The sticky level is the
// `stickyLayer` of the overlay scale (a unit test pins the two together). Opaque, or the content
// would show through while scrolling under it.
export const anchorBarClass =
  'sticky -top-4 z-rop-sticky -mx-4 -mt-4 min-w-0 border-b border-rop-border bg-rop-surface sm:-mx-6';
// The list scrolls horizontally on its own (never the page) and never wraps.
export const anchorBarListClass =
  'm-0 flex min-w-0 list-none flex-nowrap gap-1 overflow-x-auto overflow-y-hidden p-0 px-4 sm:px-6';
export const anchorBarItemClass = 'min-w-0 shrink-0';
// 46px tall (padding, line and border): a touch target. A long title is cut by the max width, never wrapped.
export const anchorBarLinkClass =
  'block max-w-64 overflow-hidden text-ellipsis whitespace-nowrap border-0 border-b-2 border-solid ' +
  'px-3 py-3 text-rop-label font-[500] no-underline rop-hover:bg-rop-surface-subtle ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:[outline-offset:-2px]';
export const anchorBarLinkIdleClass = 'border-transparent text-rop-text-muted rop-hover:text-rop-text';
export const anchorBarLinkActiveClass = 'border-rop-primary font-[600] text-rop-primary';
