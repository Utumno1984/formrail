// The "Free and Pro" table and the "Size and SSR" blocks of the Introduction (ticket #723), rendered from the data
// of ./free-and-pro.ts. The rules (what each column lists, where a link points, how a size is printed) live there,
// guarded by scripts/free-and-pro.test.mjs.
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { AnchorMdx } from '@storybook/addon-docs/blocks';
// The committed baselines of the bundle budget (spec §1.11), imported as they are: the page prints what the
// baseline says, never what the current build measures. The guard checks this list against BUDGET_FILES.
import coreBudget from '../packages/core/bundle-budget.json';
import proBudget from '../packages/pro/bundle-budget.json';
import proEngineBudget from '../packages/pro/bundle-budget.engine.json';
import proReactHookFormBudget from '../packages/pro/bundle-budget.react-hook-form.json';
import proTanStackFormBudget from '../packages/pro/bundle-budget.tanstack-form.json';
import { FREE_AND_PRO, SSR_MODULES, catalogHref, formatBytes, sizeSummary, type BudgetFile, type CatalogItem } from './free-and-pro';

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
    <div role="region" aria-label="Free and Pro table" tabIndex={0} data-testid="free-and-pro" style={{ overflowX: 'auto', maxWidth: '100%', position: 'relative' }}>
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

const BUDGETS: Record<string, BudgetFile> = {
  '@formrail/core': coreBudget,
  '@formrail/pro': proBudget,
  '@formrail/pro/engine': proEngineBudget,
  '@formrail/pro/react-hook-form': proReactHookFormBudget,
  '@formrail/pro/tanstack-form': proTanStackFormBudget,
};

const SUMMARY = sizeSummary(Object.entries(BUDGETS).map(([specifier, budget]) => ({ specifier, budget })));

const Size = ({ name, bytes }: { name: string; bytes: number }) => (
  <>
    <code>{name}</code> {formatBytes(bytes)}
  </>
);

/** The size of `cn`, read from the core baseline: the class merging most styled components include. */
export function CnSize() {
  const cn = coreBudget.exports.cn;
  return <>{formatBytes(cn.baseline)}</>;
}

/** One row per entry (smallest and largest import), then every import in a disclosure. */
export function SizeTable() {
  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by the keyboard */}
      <div role="region" aria-label="Size per entry" tabIndex={0} data-testid="size-summary" style={{ overflowX: 'auto', maxWidth: '100%', position: 'relative' }}>
        <table style={{ minWidth: 560, margin: 0 }}>
          <thead>
            <tr>
              <th scope="col">Entry</th>
              <th scope="col">Imports</th>
              <th scope="col">Smallest</th>
              <th scope="col">Largest</th>
            </tr>
          </thead>
          <tbody>
            {SUMMARY.map((entry) => (
              <tr key={entry.specifier} data-entry={entry.specifier}>
                <th scope="row">
                  <code>{entry.specifier}</code>
                </th>
                <td>{entry.count}</td>
                <td>
                  <Size {...entry.smallest} />
                </td>
                <td>
                  <Size {...entry.largest} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details data-testid="size-every-import">
        <summary>Size of every import</summary>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by the keyboard */}
        <div role="region" aria-label="Size of every import" tabIndex={0} style={{ overflowX: 'auto', maxWidth: '100%', position: 'relative' }}>
          <table style={{ minWidth: 420, margin: 0 }}>
            <thead>
              <tr>
                <th scope="col">Import</th>
                <th scope="col">Entry</th>
                <th scope="col">Minified + gzip</th>
              </tr>
            </thead>
            <tbody>
              {SUMMARY.flatMap((entry) =>
                entry.rows.map((row) => (
                  <tr key={`${entry.specifier} ${row.name}`} data-import={`${entry.specifier} ${row.name}`}>
                    <th scope="row">
                      <code>{row.name}</code>
                    </th>
                    <td>
                      <code>{entry.specifier}</code>
                    </td>
                    <td>{formatBytes(row.bytes)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

/** The modules a `*.ssr.test.tsx` renders on the server (`renderToString`), per package, comma separated. */
export function SsrModules({ pkg }: { pkg: 'core' | 'pro' }) {
  const names = SSR_MODULES.filter((module) => module.package === pkg).map((module) => module.name);
  return (
    <span data-ssr-modules={pkg}>
      {names.map((name, index) => (
        <Fragment key={name}>
          {index > 0 && ', '}
          <code>{name}</code>
        </Fragment>
      ))}
    </span>
  );
}
