/**
 * Dispatched (bubbling) by a focused Field on its own root right after it changes `--rop-keyboard-inset` on `<html>`,
 * and before it measures and scrolls itself above the keyboard. A container that lowers that height for its content
 * (the Object Page, by the room below its scroller: `use-bottom-gap.ts`) re-measures on it, synchronously, so the
 * scroll margins the Field's scroll reads are already those of the new keyboard (#498).
 */
export const KEYBOARD_INSET_EVENT = 'rop-keyboard-inset';
