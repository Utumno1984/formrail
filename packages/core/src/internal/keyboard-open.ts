import { useEffect, useState } from 'react';

/**
 * True while the on-screen keyboard covers part of the layout viewport (spec §1.10). The
 * positioning engine already measures the room on the visual viewport, but only re-measures on
 * window resize and scroll, which the keyboard does not fire: the caller switches the popover to
 * per-frame updates while this is true, so the list follows the keyboard coming, growing and going.
 */
export function useKeyboardOpen(active: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!active || !vv) return undefined;
    // Pinch-zoom also resizes the visual viewport: the arithmetic is for scale 1 only.
    const update = () => setOpen(vv.scale === 1 && window.innerHeight - vv.height - vv.offsetTop > 1);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setOpen(false);
    };
  }, [active]);
  return open;
}
