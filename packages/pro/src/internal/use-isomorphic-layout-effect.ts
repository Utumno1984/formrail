import { useEffect, useLayoutEffect } from 'react';

// `useLayoutEffect` warns when rendering on the server (React 18); the effect only matters in the browser.
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
