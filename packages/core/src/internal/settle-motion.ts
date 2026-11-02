// Story / test helpers (never imported by the components, so not part of the published bundle).
// A modal panel now animates in: a play function that measures it (geometry, visibility) must do so
// on the final state, not on a frame of the entry. `settleMotion` waits for every running CSS
// animation of the document to finish; it is a no-op when there is none (`prefers-reduced-motion`,
// or already settled). It never changes a tolerance or a timeout: it only moves the moment of the
// measurement.
export async function settleMotion(): Promise<void> {
  // A finished animation can be followed by another one that it triggers (a state change at the
  // end), so look again until none is left. Bounded: this is a test helper, not a loop to trust.
  for (let round = 0; round < 5; round += 1) {
    const running = document.getAnimations().filter((a) => a.playState === 'running' || a.pending);
    if (running.length === 0) return;
    await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
  }
}

// For a play function that must NOT be delayed (an e2e test drives the same story concurrently, so
// waiting before the interaction would reorder it): after the interaction, let the entry motion of the
// container finish and make every open popover re-measure its anchor (floating-ui listens to window
// scroll/resize). A popover opened mid-scale otherwise stays sub-pixels off for good (visual flake, #111).
export async function repositionAfterMotion(): Promise<void> {
  await settleMotion();
  // `scroll`, not `resize`: Radix Select closes itself on a window resize, but not on a scroll.
  window.dispatchEvent(new Event('scroll'));
  // Let the repositioning commit before the story is considered played.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
