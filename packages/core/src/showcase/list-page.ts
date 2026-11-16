// Story-only (#519): the frame of a list page of the showcases, in a file of its own so that the List Report
// showcase (#132) and the record-editing shell (`RecordListView`) both use it without one depending on the other.
// Not exported by the package.
import type { CSSProperties } from 'react';

/** The frame of a list page: the full height of the story, the List Report filling it. */
export const LIST_PAGE: CSSProperties = {
  boxSizing: 'border-box',
  padding: 16,
  fontFamily: 'system-ui, sans-serif',
  height: 'var(--rop-demo-viewport-height, 100dvh)',
  display: 'flex',
  flexDirection: 'column',
};
