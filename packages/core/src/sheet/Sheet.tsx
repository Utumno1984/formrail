import { forwardRef, type ElementRef, type ReactNode, type RefObject } from 'react';
import type * as RadixDialog from '@radix-ui/react-dialog';
import {
  ModalBody,
  ModalClose,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalOwnClose,
  ModalPanel,
  ModalRoot,
  ModalTitle,
  createModalTrigger,
  modalPanelClass,
  type ModalCloseProps,
  type ModalContentBaseProps,
  type ModalRootProps,
  type ModalTitleProps,
  type ModalTriggerProps,
} from '../internal/modal';
import { overlayLayer } from '../overlay/layers';
import { cn } from '../utils/cn';

export type SheetSide = 'left' | 'right';
export type SheetSize = 'sm' | 'md' | 'lg';

// Full literals (Tailwind scan). Declared widths; `max-w-full` caps the panel at the viewport, so
// on a narrower screen it takes at most 100% of it and never overflows.
const SIZE_CLASS: Record<SheetSize, string> = {
  sm: 'w-[22rem]',
  md: 'w-[30rem]',
  lg: 'w-[42rem]',
};

const SIDE_CLASS: Record<SheetSide, string> = {
  right: 'right-0 [--rop-modal-from-translate:100%_0] [box-shadow:-10px_0_30px_rgb(0_0_0/0.25)]',
  left: 'left-0 [--rop-modal-from-translate:-100%_0] [box-shadow:10px_0_30px_rgb(0_0_0/0.25)]',
};

// Anchored to one edge, as tall as the visual viewport (`top`/`height` follow it, see
// `modalPanelClass`), so an on-screen keyboard does not hide the active field. It slides in from
// its edge and out again (`--rop-modal-from-translate` in SIDE_CLASS); instant under reduced motion.
const BASE = /* @__PURE__ */ modalPanelClass('fixed top-[var(--rop-vv-top)] h-[var(--rop-vv-h)] max-w-full');

const NAMES = { part: 'SheetContent', root: 'Sheet', title: 'SheetTitle' };

export type SheetProps = ModalRootProps;

/**
 * Side sheet root (wraps `@radix-ui/react-dialog`): same guarantees as `Dialog` (the open state is
 * tracked here, so every way of opening has the full bookkeeping; the focus returns through
 * `useReturnFocus`), with the panel anchored to the left or right edge.
 */
export function Sheet(props: SheetProps) {
  return <ModalRoot {...props} />;
}

export type SheetTriggerProps = ModalTriggerProps;

/** Opens the sheet on click. `asChild` renders your own element (e.g. a `Button`) instead. */
export const SheetTrigger = /* @__PURE__ */ createModalTrigger('SheetTrigger', 'Sheet');

export interface SheetContentProps extends ModalContentBaseProps {
  /** The edge the panel is attached to. Can change while the sheet is open. */
  side?: SheetSide;
  /** Width step. A conflicting width in `className` wins. */
  size?: SheetSize;
  /**
   * Whether Escape and a click on the backdrop close the sheet. While `false`, a press
   * on the backdrop also keeps the focus on the element that has it (it does not fall back to `body`).
   */
  dismissible?: boolean;
  /** Receives the focus on close when the opener is gone or disabled (or there never was one). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /**
   * The sheet's own close button, for the panels that render no `SheetClose`. A touch screen has no Escape key, and
   * below 30rem (`md`) the panel takes the whole width, so no backdrop is left to tap: without a close button a
   * finger could not leave. While `true` and no `SheetClose` is mounted in the panel (the default button, or one
   * with `asChild` / `children`, such as a Cancel in the footer), the sheet draws a close button at the top end
   * corner, after the content in the Tab order, named like `SheetClose` (see `labels`). A `SheetClose` takes its
   * place as soon as it mounts, also later (content loaded asynchronously): never two buttons. Not drawn with
   * `dismissible={false}` (the way out is an action of the panel, by contract) nor with `asChild` (the panel is your
   * element). `false`: never drawn; in development a sheet that was open with no `SheetClose` at all, dismissible,
   * logs a `console.warn` once, when it closes.
   *
   * Room: a `SheetHeader` keeps 64 px at its end for the button (`pe-16`); with no `SheetHeader` the panel keeps
   * room above its first part, with an element of its own (a padding in `className` does not take it away).
   * Focus: the opening focus goes, as always, to the first element of the panel that can take it; the button comes
   * last, so that is your first field, and in a panel with nothing else to focus (a read-only view) the button
   * itself, as it would be with a `SheetClose` of yours.
   *
   * Upgrading from a version without this prop, only these sheets change:
   * - one closed by a button of yours that is not a `SheetClose` (`onClick={() => setOpen(false)}`) now shows this
   *   button too: wrap yours in `<SheetClose asChild>`, which then takes this one's place. `closeButton={false}`
   *   removes this one as well, but the sheet cannot see a button of yours that is not a `SheetClose`, so in
   *   development it logs the warning above when it closes;
   * - one with a header of your own instead of `SheetHeader`: the button sits at its top end corner, over the end of
   *   that header, so give it `pe-16` (the room `SheetHeader` keeps), or render a `SheetClose` in it.
   * @default true
   */
  closeButton?: boolean;
  /** Texts for localization; every key falls back to the English default. */
  labels?: Partial<SheetLabels>;
  /** Header, body and footer of the panel. */
  children?: ReactNode;
  /** Renders your single child element as the panel instead of the default `<div>`, with the panel's props and behavior merged onto it. */
  asChild?: boolean;
}

export interface SheetLabels {
  /**
   * Accessible name of the sheet's own close button (`closeButton`). Default `Close: <title>`, from the `SheetTitle`.
   * A given value is used as given, `''` included (rule of absent values: an empty text is not a missing key, so it
   * never falls back to the default); a blank one leaves the button without a name and logs a `console.error` in
   * development.
   */
  close: string;
}

/**
 * The sheet panel with its backdrop, rendered in a portal. `side`, `size`, `dismissible`, `returnFocusRef`,
 * `closeButton` and `labels` are consumed here and never reach the DOM. Without an accessible name (no
 * `SheetTitle`, no `aria-label`) a development `console.error` is logged.
 *
 * Always a way out by touch: the default close buttons of the sheet (`SheetClose`, and the one of `closeButton`) are
 * 44 x 44 px under a coarse pointer (24 x 24 px with a mouse), and a sheet without a `SheetClose` draws its own close
 * button (see `closeButton`).
 */
export const SheetContent = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixDialog.Content>, SheetContentProps>(
  function SheetContent(
    { side = 'right', size = 'md', dismissible = true, returnFocusRef, closeButton = true, labels, className, ...rest },
    ref,
  ) {
    return (
      <ModalPanel
        {...rest}
        ref={ref}
        names={NAMES}
        dismissible={dismissible}
        returnFocusRef={returnFocusRef}
        closeButton={closeButton}
        closeLabel={labels?.close}
        closeSlot={ModalOwnClose}
        panelClassName={cn(BASE, SIDE_CLASS[side], SIZE_CLASS[size], overlayLayer.modal, className)}
      />
    );
  },
);

/** Top row: title (and description) plus, typically, a `SheetClose`. Never scrolls away. */
export const SheetHeader = ModalHeader;

export type SheetTitleProps = ModalTitleProps;

/** The sheet's accessible name. */
export const SheetTitle = ModalTitle;

/** The sheet's accessible description. */
export const SheetDescription = ModalDescription;

/** The only part that scrolls; focusable by keyboard when its content overflows. */
export const SheetBody = ModalBody;

/** Bottom row for the actions. Never scrolls away. */
export const SheetFooter = ModalFooter;

export type SheetCloseProps = ModalCloseProps;

/**
 * Closes the sheet; same default button as `DialogClose`, named "Close: `<title>`", 44 x 44 px under a coarse
 * pointer. While one is mounted in the panel (also with `asChild` / `children`), the sheet does not draw its own
 * (`closeButton` of `SheetContent`).
 */
export const SheetClose = ModalClose;
