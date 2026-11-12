import { forwardRef, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { cn, composeRefs } from '@formrail/core';

// composeRefs: the component needs its own ref on the input AND must pass on the `ref` it is given.
const MeasuredInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>(function MeasuredInput(props, ref) {
  const own = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
      <input aria-label="Supplier" {...props} ref={composeRefs(own, ref)} />
      <button type="button" onClick={() => setWidth(own.current?.offsetWidth ?? null)}>
        Measure (own ref)
      </button>
      <output>{width === null ? 'not measured' : `${width}px wide`}</output>
    </div>
  );
});

export function UtilitiesExample() {
  const outer = useRef<HTMLInputElement>(null);
  const isCode = true as boolean;
  return (
    <div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}>
      {/* cn: clsx syntax, and conflicting Tailwind classes are resolved (the last one wins). A component that
          accepts a `className` puts its own classes first and the caller's after, so the caller can override. */}
      <code>{cn('px-2 py-1', 'px-4')}</code>
      <code>{cn('text-rop-body', 'text-rop-error', { 'font-rop-mono': isCode })}</code>

      <MeasuredInput ref={outer} />
      <button type="button" onClick={() => outer.current?.focus()}>
        Focus (forwarded ref)
      </button>
    </div>
  );
}
