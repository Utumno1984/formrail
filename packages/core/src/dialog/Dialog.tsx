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

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

// Full literals (Tailwind scan). Maximum widths; the dialog is also capped at the viewport width
// minus 1rem of margin per side (see BASE), so on a narrow screen it never overflows.
const SIZE_CLASS: Record<DialogSize, string> = {
  sm: 'max-w-[25rem]',
  md: 'max-w-[35rem]',
  lg: 'max-w-[45rem]',
  xl: 'max-w-[60rem]',
};

// `top`/`max-height` follow the visual viewport (see `modalPanelClass`). The vertical centring is an
// arbitrary declaration (the named utilities of that family emit global `--tw-*` defaults, see the
// README; the Tailwind scan also reads comments, so they are not named here).
const BASE = /* @__PURE__ */ modalPanelClass(
  '[--rop-modal-from-scale:0.96] fixed inset-x-0 mx-auto top-[calc(var(--rop-vv-top)_+_var(--rop-vv-h)_/_2)] [transform:translateY(-50%)] ' +
    'w-[calc(100%-2rem)] max-h-[calc(var(--rop-vv-h)_-_2rem)] rounded-rop-lg ' +
    '[box-shadow:0_10px_30px_rgb(0_0_0/0.25)]',
);

const NAMES = { part: 'DialogContent', root: 'Dialog', title: 'DialogTitle' };

export type DialogProps = ModalRootProps;

/**
 * Modal dialog root (wraps `@radix-ui/react-dialog`). The open state is tracked here, not only
 * inside Radix, so that `useReturnFocus` sees every way of opening: with `DialogTrigger`, or from
 * application state with no trigger at all. The focus returns to the element that had it before
 * opening (or to `DialogContent`'s `returnFocusRef`), never through Radix's own trigger-only return.
 */
export function Dialog(props: DialogProps) {
  return <ModalRoot {...props} />;
}

export type DialogTriggerProps = ModalTriggerProps;

/** Opens the dialog on click. `asChild` renders your own element (e.g. a `Button`) instead. */
export const DialogTrigger = /* @__PURE__ */ createModalTrigger('DialogTrigger', 'Dialog');

export interface DialogContentProps
  extends Omit<ComponentPropsWithoutRef<typeof RadixDialog.Content>, 'children' | 'forceMount'> {
  /** Maximum width step. Default `md`. A conflicting width in `className` wins. */
  size?: DialogSize;
  /**
   * Whether Escape and a click on the backdrop close the dialog. Default `true`; `false` is for
   * dialogs that require an explicit choice (a button must close it).
   */
  dismissible?: boolean;
  /**
   * Receives the focus on close when the opener is gone or disabled (or there never was one). Needed
   * for a chain where one dialog closes and another opens in the same handler ("Continue" ->
   * confirmation): the second one's opener is a button of the first, which unmounts, so without it
   * the focus is not returned anywhere when the second closes.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

/**
 * The dialog panel with its backdrop, rendered in a portal. `size`, `dismissible` and
 * `returnFocusRef` are consumed here and never reach the DOM. Without an accessible name (no
 * `DialogTitle`, no `aria-label`) a development `console.error` is logged.
 */
export const DialogContent = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixDialog.Content>, DialogContentProps>(
  function DialogContent({ size = 'md', dismissible = true, returnFocusRef, className, ...rest }, ref) {
    return (
      <ModalPanel
        {...rest}
        ref={ref}
        names={NAMES}
        dismissible={dismissible}
        returnFocusRef={returnFocusRef}
        panelClassName={cn(BASE, SIZE_CLASS[size], overlayLayer.modal, className)}
      />
    );
  },
);

/** Top row: title (and description) plus, typically, a `DialogClose`. Never scrolls away. */
export const DialogHeader = ModalHeader;

export type DialogTitleProps = ModalTitleProps;

/** The dialog's accessible name. */
export const DialogTitle = ModalTitle;

/** The dialog's accessible description. */
export const DialogDescription = ModalDescription;

/**
 * The only part that scrolls. When its content overflows it becomes focusable, so a keyboard user
 * can scroll it. A wide child (table) scrolls horizontally inside it; the dialog never widens.
 */
export const DialogBody = ModalBody;

/** Bottom row for the actions. Never scrolls away. */
export const DialogFooter = ModalFooter;

export type DialogCloseProps = ModalCloseProps;

/**
 * Closes the dialog. With no children and no `asChild` it renders the default close button: a ghost
 * `icon-xs` `Button` with the close icon, named "Chiudi: <title>" (from the dialog's title) unless
 * you pass `aria-label` / `aria-labelledby`. With `children` / `asChild` it is Radix's plain Close.
 */
export const DialogClose = ModalClose;
