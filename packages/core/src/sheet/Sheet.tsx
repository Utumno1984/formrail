import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode, type RefObject } from 'react';
import type * as RadixDialog from '@radix-ui/react-dialog';
import {
  ModalBody,
  ModalClose,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalPanel,
  ModalRoot,
  ModalTitle,
  createModalTrigger,
  modalPanelClass,
  type ModalCloseProps,
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

export interface SheetContentProps
  extends Omit<ComponentPropsWithoutRef<typeof RadixDialog.Content>, 'children' | 'forceMount'> {
  /** The edge the panel is attached to. Default `right`. Can change while the sheet is open. */
  side?: SheetSide;
  /** Width step. Default `md`. A conflicting width in `className` wins. */
  size?: SheetSize;
  /** Whether Escape and a click on the backdrop close the sheet. Default `true`. */
  dismissible?: boolean;
  /** Receives the focus on close when the opener is gone or disabled (or there never was one). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

/**
 * The sheet panel with its backdrop, rendered in a portal. `side`, `size`, `dismissible` and
 * `returnFocusRef` are consumed here and never reach the DOM. Without an accessible name (no
 * `SheetTitle`, no `aria-label`) a development `console.error` is logged.
 */
export const SheetContent = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixDialog.Content>, SheetContentProps>(
  function SheetContent({ side = 'right', size = 'md', dismissible = true, returnFocusRef, className, ...rest }, ref) {
    return (
      <ModalPanel
        {...rest}
        ref={ref}
        names={NAMES}
        dismissible={dismissible}
        returnFocusRef={returnFocusRef}
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

/** Closes the sheet; same default button as `DialogClose`, named "Chiudi: <title>". */
export const SheetClose = ModalClose;
