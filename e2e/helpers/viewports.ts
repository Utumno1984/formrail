/** Viewport grid (spec §1.10), shared by the visual projects in playwright.config.ts and the specs that need a named viewport. */
export const VIEWPORTS = [
  ['mobile', 375, 667],
  ['tablet', 768, 1024],
  ['desktop', 1280, 800],
] as const;

export const MOBILE_VIEWPORT = { width: VIEWPORTS[0][1], height: VIEWPORTS[0][2] };
