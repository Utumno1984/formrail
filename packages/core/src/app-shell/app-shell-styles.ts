// Class names of the app shell, kept apart from its logic. Full literals on purpose (the CSS build scans the
// sources, comments included, so no bare utility name appears in a comment here).

/**
 * The width from which the navigation is a column beside the content: the same value as the `min-[64rem]:`
 * variant of {@link navClass} (desktop 1280 and landscape tablet 1024 have the column, portrait tablet 768 and
 * phones do not). The choice is made in CSS, so nothing moves at the first paint or at hydration; this constant
 * is the value for code that must agree with it (a `matchMedia` query). A plain literal: a class built from it at
 * load time would not be seen by the CSS build; a unit test pins the two together.
 */
export const APP_SHELL_NAV_BREAKPOINT = '64rem';

// The shell: a two-column, two-row grid. Header across the top (its own height), navigation and content below
// (what is left). The first column takes the width of the navigation, or nothing when there is none, so the
// content then spans the whole width. Zero minimum on the content column and row: the content scrolls inside its
// cell instead of pushing the shell taller or wider.
export const rootClass =
  'relative grid min-w-0 max-w-full grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] ' +
  'bg-rop-surface font-rop-sans text-rop-body text-rop-text';
// Height of the shell. Page: the dynamic viewport height (follows a phone's address bar; never the static
// `vh`, which a phone measures with the bar hidden). Parent: the height of the parent, which must have one.
export const rootViewportClass = 'h-dvh';
export const rootParentClass = 'h-full';

// The header: first row, both columns. Its height is a component-owned variable with a default (overridable on
// any ancestor or on the header itself), never the height of what the slots hold: empty slots, slots filled after
// the mount and a long text leave it unchanged. The variable is the whole footprint, its 1px bottom rule included,
// with or without a consumer's box-sizing reset: see `boxStyle`.
export const headerClass =
  'col-span-full row-start-1 flex h-[var(--rop-app-shell-header-height,3.5rem)] min-w-0 items-center gap-3 ' +
  'border-0 border-b border-solid border-rop-border bg-rop-surface px-4';
// The three parts of the header. Every part shrinks (zero minimum): a long text inside a truncating child is cut
// at the real width of its part, never pushes the page wider. Every part starts from the width of its content and,
// when the row is short of room, the three shrink in proportion to it: none of them is squeezed to nothing while
// the others keep their text (a middle part with a zero basis would vanish on a phone). The middle part also takes
// the free room, so the end part stays at the end even when the others are empty.
export const headerStartClass = 'flex min-w-0 shrink items-center gap-2';
export const headerCenterClass = 'flex min-w-0 flex-auto items-center justify-center gap-2';
export const headerEndClass = 'flex min-w-0 shrink items-center justify-end gap-2';

// The navigation: second row, first column, a set width (component-owned variable with a default). Below the
// breakpoint it is not displayed and the content takes the whole width. It scrolls on its own only when its links
// are taller than the room it has; it never scrolls with the content.
export const navClass =
  'col-start-1 row-start-2 hidden min-h-0 w-[var(--rop-app-shell-nav-width,16rem)] overflow-y-auto overflow-x-hidden ' +
  'border-0 border-e border-solid border-rop-border bg-rop-surface-subtle min-[64rem]:block';
export const navListClass = 'm-0 flex list-none flex-col gap-0.5 p-2';
export const navItemClass = 'flex min-w-0 flex-col';

// A link of the navigation: one line, truncated at the column's width, 2.5rem tall with or without a consumer's
// box-sizing reset (no vertical padding: the minimum height alone sets it, the text is centred in it) (the focus indicator is drawn inside the
// box, so the scroll container of the navigation never clips it). Hover and pressed feedback only on a link that
// can be followed.
export const navLinkClass =
  'relative m-0 flex min-h-10 min-w-0 items-center gap-2 rounded-rop-md border-0 bg-transparent px-3 py-0 ' +
  'text-start font-rop-sans text-rop-body text-rop-text no-underline ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:[outline-offset:-2px]';
export const navLinkEnabledClass =
  'cursor-pointer rop-hover:bg-rop-surface-pressed active:bg-rop-surface-pressed ' +
  'motion-safe:[transition-property:background-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)]';
// The current page: a tinted background, a heavier weight and a bar on the inline start edge (a shape, not only a
// colour; a system colour under forced colours).
export const navLinkActiveClass =
  'bg-rop-primary-subtle font-semibold text-rop-primary rop-hover:bg-rop-primary-subtle-hover active:bg-rop-primary-subtle-hover ' +
  "before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-e-full before:bg-rop-primary before:content-[''] " +
  'forced-colors:before:bg-[Highlight]';
export const navLinkDisabledClass = 'cursor-not-allowed text-rop-text-muted';
export const navLinkIconClass = 'flex size-5 shrink-0 items-center justify-center';

// The content: second row, second column. The only scroller of a simple page; a floorplan that takes the height
// of its parent fills it exactly and scrolls by itself (this cell then has nothing to scroll). The focus
// indicator (after the skip link) is drawn inside the box.
export const mainClass =
  'col-start-2 row-start-2 min-h-0 min-w-0 overflow-y-auto ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:[outline-offset:-2px]';

// The skip link: always the first stop of the Tab order, transparent and not clickable until it has the focus,
// then drawn over the start of the header (absolutely placed: nothing moves when it appears).
export const skipLinkClass =
  'pointer-events-none absolute start-2 top-2 z-rop-sticky rounded-rop-md border border-solid border-rop-primary ' +
  'bg-rop-surface px-3 py-2 font-rop-sans text-rop-body font-semibold text-rop-primary underline opacity-0 ' +
  'focus:pointer-events-auto focus:opacity-100 ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2';

// The virtual keyboard (spec §1.10), counted once. A focused Field publishes the keyboard's height on the
// document's root (`--rop-keyboard-inset`). The shell's root relays it (a property cannot read itself on the
// element that declares it); the content cell turns it into room below its content (its bottom padding) and into
// a scroll padding of the same height (the browser's focus scrolling and `scrollIntoView` stop above it), and
// resets the variable to zero for what it holds: a Field inside then keeps only its own small margin, and a
// floorplan inside (shorter by that padding, its save bar above the keyboard) does not add the keyboard a second
// time. Inline, not in a class: the shipped CSS declares no new property.
// The header's height and the navigation's width are their whole footprint, the 1px rule included, whether or not
// the consumer's page has a box-sizing reset. Inline on those two elements only: the shipped CSS sets no box-sizing
// at all (no preflight; a guard in test/styles.test.ts rejects any box-sizing rule in it).
export const boxStyle = { boxSizing: 'border-box' } as const;
export const rootStyle = { '--rop-app-shell-keyboard-inset': 'var(--rop-keyboard-inset, 0px)' } as const;
export const mainStyle = {
  paddingBottom: 'var(--rop-app-shell-keyboard-inset, 0px)',
  scrollPaddingBottom: 'var(--rop-app-shell-keyboard-inset, 0px)',
  '--rop-keyboard-inset': '0px',
} as const;
