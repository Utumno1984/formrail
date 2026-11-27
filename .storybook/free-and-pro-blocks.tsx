// The "Free and Pro" table of the Introduction (ticket #723), rendered from the data of ./free-and-pro.ts. The
// rules (what each column lists, where a link points) live there, guarded by scripts/free-and-pro.test.mjs.
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { AnchorMdx } from '@storybook/addon-docs/blocks';
import { FREE_AND_PRO, catalogHref, type CatalogItem } from './free-and-pro';

/** `''` in the complete build, `'../pro/'` in the public Free build (see `proDocsBase` in story-globs.mjs). */
const PRO_BASE = __FORMRAIL_PRO_DOCS_BASE__;

function ItemLink({ entry, side }: { entry: CatalogItem; side: 'free' | 'pro' }) {
  const href = catalogHref(entry, side, PRO_BASE);
  // A page of this Storybook: Storybook's own MDX link, which moves the manager (the page lives in its iframe).
  if (side === 'free' || PRO_BASE === '') {
    return (
      <AnchorMdx href={href} target="_self">
        {entry.label}
      </AnchorMdx>
    );
  }
  // The Pro demo, another Storybook next to this one: a plain link that replaces the whole window.
  return (
    <a href={href} target="_top">
      {entry.label}
    </a>
  );
}

// Read by a screen reader, not shown (the dash is shown instead): a bare dash is read inconsistently, or not at all.
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

function Items({ items, side }: { items: readonly CatalogItem[]; side: 'free' | 'pro' }): ReactNode {
  if (items.length === 0) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span style={VISUALLY_HIDDEN}>Not in {side === 'pro' ? 'Pro' : 'Free'}</span>
      </>
    );
  }
  return items.map((entry, index) => (
    <Fragment key={entry.label}>
      {index > 0 && ' · '}
      <ItemLink entry={entry} side={side} />
    </Fragment>
  ));
}

/**
 * The table. At a narrow width it keeps a readable minimum width and scrolls inside its own frame, which is a
 * focusable, named region so the keyboard can scroll it too; the page itself never scrolls sideways.
 */
export function FreeAndProTable() {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by the keyboard (axe scrollable-region-focusable)
    <div role="region" aria-label="Free and Pro table" tabIndex={0} data-testid="free-and-pro" style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table data-free-and-pro style={{ minWidth: 560, margin: 0 }}>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">
              Free: <code>@formrail/core</code>, MIT
            </th>
            <th scope="col">
              Pro: <code>@formrail/pro</code>, commercial license
            </th>
          </tr>
        </thead>
        <tbody>
          {FREE_AND_PRO.map((row) => (
            <tr key={row.area}>
              <th scope="row">{row.area}</th>
              <td>
                <Items items={row.free} side="free" />
              </td>
              <td>
                <Items items={row.pro} side="pro" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
