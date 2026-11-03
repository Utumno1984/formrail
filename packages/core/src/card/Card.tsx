import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from 'react';
import { isDev } from '../internal/is-dev';
import { Title, type TitleProps } from '../typography/Title';
import { cn } from '../utils/cn';

export type CardElement = 'div' | 'section' | 'article';
export type CardTitleLevel = 2 | 3 | 4 | 5 | 6;

interface CardContextValue {
  /** Called by a mounted `CardTitle` with its id; returns the cleanup. */
  registerTitle: (id: string) => () => void;
}

const CardContext = /* @__PURE__ */ createContext<CardContextValue | null>(null);

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * Root element. Default `div`. With `section` or `article` the root gets `aria-labelledby`
   * pointing at the `CardTitle` (unless you pass your own `aria-labelledby` / `aria-label`), so the
   * landmark/article has a name; a `section` without a name is not a landmark, and in development
   * a warning says so.
   */
  as?: CardElement;
}

/**
 * Static compound container (`CardHeader`, `CardTitle`, `CardDescription`, `CardBody`,
 * `CardFooter`). It never uses `overflow: hidden` (that would clip the focus indicator of children at
 * the rounded border) and long unbroken text wraps instead of overflowing. Like every box of the
 * library it is `content-box`.
 */
export const Card = /* @__PURE__ */ forwardRef<HTMLElement, CardProps>(function Card(
  { as = 'div', className, 'aria-labelledby': labelledBy, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  const Tag = as as 'div';
  const [titleId, setTitleId] = useState<string | null>(null);
  const titleSeen = useRef(false);
  const registerTitle = useCallback((id: string) => {
    titleSeen.current = true;
    setTitleId(id);
    return () => {
      titleSeen.current = false;
      setTitleId((current) => (current === id ? null : current));
    };
  }, []);
  const context = useMemo(() => ({ registerTitle }), [registerTitle]);
  const named = as !== 'div';
  const hasOwnName = labelledBy !== undefined || ariaLabel !== undefined;

  useEffect(() => {
    if (named && !hasOwnName && !titleSeen.current && isDev()) {
      console.warn(
        `[react-object-page] <Card as="${as}"> has no <CardTitle>, aria-labelledby or aria-label: it has no accessible name, so it is not a landmark.`,
      );
    }
  }, [named, hasOwnName, as]);

  return (
    <CardContext.Provider value={context}>
      <Tag
        {...rest}
        ref={ref as never}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy ?? (named && !ariaLabel && titleId ? titleId : undefined)}
        className={cn(
          'flex min-w-0 flex-col rounded-rop-lg border border-rop-border bg-rop-surface font-rop-sans text-rop-body text-rop-text [overflow-wrap:anywhere]',
          className,
        )}
      />
    </CardContext.Provider>
  );
});

/** Top block: title and description, stacked. */
export const CardHeader = /* @__PURE__ */ forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...rest }, ref) {
    return <div {...rest} ref={ref} className={cn('flex min-w-0 flex-col gap-1 px-4 pt-4', className)} />;
  },
);

export interface CardTitleProps extends Omit<TitleProps, 'level'> {
  /** Heading level 2-6. Default 3. */
  level?: CardTitleLevel;
}

/**
 * Heading of the card (reuses `Title`). Its id (generated, or your `id`) names a `section` /
 * `article` Card through `aria-labelledby`.
 */
export const CardTitle = /* @__PURE__ */ forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle(
  { level = 3, id, className, ...rest },
  ref,
) {
  const generated = useId();
  const titleId = id ?? generated;
  const context = useContext(CardContext);
  const register = context?.registerTitle;
  useEffect(() => register?.(titleId), [register, titleId]);
  return <Title {...rest} id={titleId} ref={ref} level={level} className={cn('min-w-0', className)} />;
});

/** Secondary text of the header (muted). */
export const CardDescription = /* @__PURE__ */ forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...rest }, ref) {
    return <p {...rest} ref={ref} className={cn('m-0 min-w-0 text-rop-body text-rop-text-muted', className)} />;
  },
);

/** Main content. */
export const CardBody = /* @__PURE__ */ forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...rest }, ref) {
    return <div {...rest} ref={ref} className={cn('min-w-0 px-4 py-4', className)} />;
  },
);

/**
 * Actions, aligned to the end of the line (right in LTR, left in RTL) and wrapping onto further
 * lines in a narrow container instead of overlapping.
 */
export const CardFooter = /* @__PURE__ */ forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...rest }, ref) {
    return (
      <div {...rest} ref={ref} className={cn('flex min-w-0 flex-wrap justify-end gap-2 px-4 pb-4', className)} />
    );
  },
);
