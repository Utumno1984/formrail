// Internal: keeps native checkable inputs (Checkbox, Switch, RadioGroup) in step with React when the
// browser changes `checked` behind its back. Not exported from the package.
import { useCallback, useEffect, useRef, type RefObject } from 'react';

export interface FormResetSyncOptions {
  /** `true` when React owns `checked` (a `checked`/`value` prop is passed). */
  controlled: boolean;
  /** Re-renders the component (a `useReducer` dispatch): its commit re-applies the controlled `checked`. */
  rerender: () => void;
  /**
   * Also re-render after an uncontrolled reset, once the tracker is realigned. For a component that
   * derives something from the DOM selection after render (RadioGroup's `data-rop-name`).
   */
  rerenderUncontrolled?: boolean;
}

/**
 * React's value tracker is only updated through the `checked` setter. A cancelled click or a form
 * reset makes the browser change `checked` without it, so the next real click would look like "no
 * change" and `onChange` would never fire. This hook owns the one fix for that:
 *
 * - `realign()` (returned) re-assigns every input its own current `checked` on the next task, once
 *   the browser has finished (a cancelled click is reverted after the handlers run). Call it after an
 *   uncontrolled click.
 * - on the owning form's `reset`, deferred the same way (the event fires before the browser resets):
 *   - uncontrolled: `realign()` (the DOM is the state; React must learn the reset value), then
 *     `rerender()` if `rerenderUncontrolled`;
 *   - controlled: only `rerender()`. React state is the truth, and the commit writes the controlled
 *     `checked` through the real setter on every input (React does so even when it looks unchanged,
 *     for radio tracking), which fixes the DOM and the tracker at once: a `realign()` there would be
 *     a redundant write.
 *
 * `ref` is either the input itself (Checkbox, Switch: its `form`) or a container of radios
 * (RadioGroup: every `input[type="radio"]` inside, the closest `<form>`). The form is looked up when
 * the component mounts or switches between controlled and uncontrolled. Pending timers are cleared
 * on unmount.
 */
export function useFormResetSync(
  ref: RefObject<HTMLElement | null>,
  { controlled, rerender, rerenderUncontrolled = false }: FormResetSyncOptions,
): () => void {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((fn: () => void) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, 0);
    timers.current.add(timer);
  }, []);

  const realign = useCallback(() => {
    later(() => {
      const root = ref.current;
      if (!root) return;
      const inputs =
        root instanceof HTMLInputElement ? [root] : root.querySelectorAll<HTMLInputElement>('input[type="radio"]');
      inputs.forEach((el) => {
        const checked = el.checked;
        el.checked = checked;
      });
    });
  }, [later, ref]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  useEffect(() => {
    const root = ref.current;
    const form = root instanceof HTMLInputElement ? root.form : root?.closest('form');
    if (!form) return;
    const onReset = () => {
      if (controlled) {
        later(rerender);
        return;
      }
      realign();
      if (rerenderUncontrolled) later(rerender);
    };
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, [ref, controlled, rerender, rerenderUncontrolled, realign, later]);

  return realign;
}
