import { createContext, useContext, type ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

/** Why a toast went away: its timer, the user (close button, action, Escape), a newer toast, or `dismiss()`. */
export type ToastDismissReason = 'timeout' | 'user' | 'replaced' | 'programmatic';

export interface ToastOptions {
  /**
   * Identity of the toast. `show` with the id of the toast on screen updates it in place (same node,
   * the new text is announced, the timer restarts). If the update switches the tone between `error`
   * and another, the toast moves to the other live region: it is a new node and a focus inside the
   * toast goes back to the previous element. Default: a generated id.
   */
  id?: string;
  /** Default `info`. `error` is announced assertively (`role="alert"`), the other tones politely. */
  tone?: ToastTone;
  /** Bold first line. It is also part of the close button's name ("Dismiss notification: `<title>`"). */
  title?: ReactNode;
  /** The message. An empty or whitespace-only value shows nothing (and logs an error in development). */
  description: ReactNode;
  /**
   * One button. The toast stays until the user closes it (no `duration` by default): an action must
   * stay reachable without a time limit (WCAG 2.2.1). A numeric `duration` is honoured but warns in
   * development. `onClick` runs, then the toast closes with reason `user`.
   */
  action?: { label: string; onClick: () => void };
  /**
   * Milliseconds before the toast closes by itself. Default: the provider's `defaultDuration`
   * (5000) without an action, `null` (stays until closed) with one. `null` never closes it.
   */
  duration?: number | null;
  /** Called once when the toast goes away, with the reason. */
  onDismiss?: (reason: ToastDismissReason) => void;
}

export interface UseToastReturn {
  /** Shows a toast and returns its id. With the Free policy a new toast replaces the visible one. */
  show: (options: ToastOptions) => string;
  /** Closes the toast with this id; with no id, the visible one. Unknown id: no-op. */
  dismiss: (id?: string) => void;
}

export const ToastContext = /* @__PURE__ */ createContext<UseToastReturn | null>(null);

/**
 * Imperative access to the nearest `ToastProvider`: `show(options)` returns the toast's id,
 * `dismiss(id?)` closes it. Both are stable between renders. Throws outside a provider.
 */
export function useToast(): UseToastReturn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('[react-object-page] useToast() must be used inside <ToastProvider>.');
  return ctx;
}
