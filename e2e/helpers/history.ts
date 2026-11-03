import type { Page } from '@playwright/test';

/**
 * Browser Back/Forward (CDP history traversal, as the browser buttons do) without waiting for it to
 * complete: a traversal that `useDirtyGuard` cancels never completes, and `page.goBack()` would wait
 * for it until the test timeout. Assert on the page (dialog, route) afterwards.
 */
export function browserBack(page: Page): void {
  void page.goBack({ waitUntil: 'commit' }).catch(() => undefined);
}

export function browserForward(page: Page): void {
  void page.goForward({ waitUntil: 'commit' }).catch(() => undefined);
}
