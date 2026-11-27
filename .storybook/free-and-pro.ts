// The data of the "Free and Pro" and "Size and SSR" sections of the Introduction (ticket #723). Pure: no JSON
// import, no Storybook runtime, so the Vitest guard (scripts/free-and-pro.test.mjs) and the e2e
// (e2e/introduction.spec.ts) read the same rules the page renders with (.storybook/free-and-pro-blocks.tsx).
//
// What keeps it honest:
// - every runtime export of `@formrail/core` is in exactly one Free item, every runtime export of every public
//   entry of `@formrail/pro` (`.`, `./engine`, `./react-hook-form`, `./tanstack-form`) in exactly one Pro item,
//   and an item names only exports that exist: a new export left out of the table, or a Pro item with nothing
//   built behind it (#491), fails the guard;
// - every item links to a Docs page that exists, of its own package;
// - the sizes are computed from the versioned baselines of the bundle budget (spec §1.11), never written here;
// - the list of the server-rendering tests is compared with the `*.ssr.test.tsx` files on disk.
import { toId } from 'storybook/internal/csf';

/** One entry of a cell of the table: a link to a Docs page and the runtime exports that page documents. */
export interface CatalogItem {
  /** The link text. */
  label: string;
  /** Title of the Docs page the link opens (Storybook title, e.g. `Forms/Input`). */
  docs: string;
  /** The runtime exports of the package this item stands for. */
  exports: readonly string[];
}

/** A row of the table: an area of the library, what Free and Pro offer there. */
export interface CatalogRow {
  area: string;
  free: readonly CatalogItem[];
  pro: readonly CatalogItem[];
}

const item = (label: string, docs: string, ...exports: string[]): CatalogItem => ({ label, docs, exports });

/**
 * The table (spec §3): Free is the whole of `@formrail/core`, Pro only what `@formrail/pro` exports today. A row
 * whose Pro cell is empty has nothing in Pro: nothing planned is listed (#491).
 */
export const FREE_AND_PRO: readonly CatalogRow[] = [
  {
    area: 'Foundations',
    free: [
      item('Typography', 'Foundations/Typography', 'Text', 'Title'),
      item('Icon', 'Foundations/Icon', 'Icon'),
      item('Utilities', 'Foundations/Utilities', 'cn', 'composeRefs'),
    ],
    pro: [],
  },
  {
    area: 'Primitives',
    free: [
      item('Button', 'Primitives/Button', 'Button'),
      item('Avatar', 'Primitives/Avatar', 'Avatar'),
      item('Card', 'Primitives/Card', 'Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardBody', 'CardFooter'),
      item('Divider', 'Primitives/Divider', 'Divider'),
      item('FieldMessage', 'Primitives/FieldMessage', 'FieldMessage'),
      item('MessageStrip', 'Primitives/MessageStrip', 'MessageStrip'),
      item('ProgressBar', 'Primitives/ProgressBar', 'ProgressBar'),
      item('Skeleton', 'Primitives/Skeleton', 'Skeleton'),
      item('Spinner', 'Primitives/Spinner', 'Spinner'),
      item('StatusBadge', 'Primitives/StatusBadge', 'StatusBadge'),
    ],
    pro: [],
  },
  {
    area: 'Forms',
    free: [
      item('Field', 'Forms/Field', 'Field', 'useFieldControl'),
      item('Input', 'Forms/Input', 'Input'),
      item('Textarea', 'Forms/Textarea', 'Textarea'),
      item('NumberInput', 'Forms/NumberInput', 'NumberInput'),
      item('Checkbox', 'Forms/Checkbox', 'Checkbox'),
      item('Switch', 'Forms/Switch', 'Switch'),
      item('RadioGroup', 'Forms/RadioGroup', 'RadioGroup', 'RadioGroupItem'),
      item('Select', 'Forms/Select', 'Select'),
      item('Combobox', 'Forms/Combobox', 'Combobox', 'useCombobox', 'defaultComboboxFilter'),
      item('MultiSelect', 'Forms/MultiSelect', 'MultiSelect'),
      item('FileUpload', 'Forms/FileUpload', 'FileUpload'),
      item('DatePicker', 'Forms/DatePicker', 'DatePicker'),
      item('Calendar', 'Forms/Calendar', 'Calendar'),
    ],
    pro: [],
  },
  {
    area: 'Navigation',
    free: [
      item('Tabs', 'Navigation/Tabs', 'Tabs', 'TabsList', 'TabsTrigger', 'TabsContent'),
      item('Breadcrumb', 'Navigation/Breadcrumb', 'Breadcrumb', 'BreadcrumbItem', 'BreadcrumbLink', 'BreadcrumbPage'),
      item('Pagination', 'Navigation/Pagination', 'Pagination'),
      item('Accordion', 'Navigation/Accordion', 'Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent'),
      item('Collapsible', 'Navigation/Collapsible', 'Collapsible', 'CollapsibleTrigger', 'CollapsibleContent'),
      item('AppLauncher', 'Navigation/AppLauncher', 'AppLauncher'),
      item('AppSwitcher', 'Navigation/AppSwitcher', 'AppSwitcher'),
    ],
    pro: [],
  },
  {
    area: 'Overlays',
    free: [
      item(
        'Dialog',
        'Overlays/Dialog',
        'Dialog',
        'DialogTrigger',
        'DialogContent',
        'DialogHeader',
        'DialogTitle',
        'DialogDescription',
        'DialogBody',
        'DialogFooter',
        'DialogClose',
      ),
      item('Sheet', 'Overlays/Sheet', 'Sheet', 'SheetTrigger', 'SheetContent', 'SheetHeader', 'SheetTitle', 'SheetDescription', 'SheetBody', 'SheetFooter', 'SheetClose'),
      item('ConfirmDialog', 'Overlays/ConfirmDialog', 'ConfirmDialog', 'useConfirmDialog'),
      item('Menu', 'Overlays/Menu', 'Menu', 'MenuTrigger', 'MenuContent', 'MenuItem', 'MenuLinkItem', 'MenuGroup', 'MenuLabel', 'MenuSeparator'),
      item('Toast', 'Overlays/Toast', 'ToastProvider', 'useToast'),
      item('Tooltip', 'Overlays/Tooltip', 'Tooltip', 'TooltipProvider'),
    ],
    pro: [],
  },
  {
    area: 'Data',
    free: [
      item('ListReportTable', 'Data/ListReportTable', 'ListReportTable'),
      item('ListReportFilterBar', 'Data/ListReportFilterBar', 'ListReportFilterBar'),
      item('DescriptionList', 'Data/DescriptionList', 'DescriptionList', 'DescriptionListItem', 'DescriptionListStatus'),
      item('TruncatedText', 'Data/TruncatedText', 'TruncatedText'),
    ],
    pro: [],
  },
  {
    area: 'List Report',
    free: [item('List Report', 'Floorplans/List Report', 'ListReport', 'useListReport', 'useListReportScrollRestoration', 'useListReportUrlState')],
    pro: [item('Virtual List Report', 'Pro/Floorplans/Virtual List Report', 'VirtualListReport', 'VirtualListReportTable')],
  },
  {
    area: 'Object Page',
    free: [
      item('Layout', 'Floorplans/Object Page/Layout', 'ObjectPage', 'ObjectPageHeader', 'ObjectPageSection'),
      item('Footer', 'Floorplans/Object Page/Footer', 'ObjectPageFooter', 'getErrorSummary'),
      item('Form and validation', 'Floorplans/Object Page/Validation', 'useObjectPageForm', 'ValidationProvider', 'useFocusFirstInvalidField'),
      item('DirtyGuard', 'Patterns/DirtyGuard', 'useDirtyGuard'),
    ],
    pro: [
      item(
        'Change Summary',
        'Pro/ChangeSummary',
        'ChangeSummary',
        'computeChangeSummary',
        'computeChangeSummaryResult',
        'useChangeSummary',
        'inferSegmentLabel',
        'formatChangeValue',
      ),
      item('Form rebase', 'Pro/Patterns/Form rebase', 'computeRebase', 'useFormRebase'),
      item('Rebase notice', 'Pro/RebaseNotice', 'RebaseNotice'),
      item('React Hook Form', 'Pro/Integrations/React Hook Form', 'useReactHookFormBinding'),
      item('TanStack Form', 'Pro/Integrations/TanStack Form', 'useTanStackFormBinding'),
    ],
  },
  {
    area: 'App Shell',
    free: [item('App Shell', 'Floorplans/App Shell', 'AppShell', 'AppShellHeader', 'AppShellMain', 'AppShellNav', 'AppShellNavLink', 'AppShellNavTrigger')],
    pro: [],
  },
];

/** Docs page id Storybook generates for a title (its own `toId`, as in scripts/docs-coverage.mjs). */
export const docsPageId = (title: string): string => toId(title, 'docs');

/**
 * Where a Pro link points. The complete build (dev, e2e, visual) has the Pro pages: `?path=...`, as any other link.
 * The public Free build (`STORYBOOK_EXCLUDE_PRO=1`, served at `/storybook/`) has none: the Pro demo is published
 * next to it at `/pro/`, so `../pro/?path=...`, opened in the top window (the link lives in the preview iframe).
 * `base` is `proDocsBase()` of .storybook/story-globs.mjs, injected by main.ts.
 */
export function catalogHref(item: CatalogItem, side: 'free' | 'pro', base: string): string {
  const path = `?path=/docs/${docsPageId(item.docs)}`;
  return side === 'pro' ? `${base}${path}` : path;
}

/** Each export name of a side of the table, once per item that lists it. */
export function catalogExports(rows: readonly CatalogRow[], side: 'free' | 'pro'): string[] {
  return rows.flatMap((row) => row[side].flatMap((entry) => entry.exports));
}

/**
 * What is wrong between a side of the table and the runtime exports of its package: an export missing from the
 * table, a name the package does not export, a name listed twice, an item with no export at all.
 */
export function catalogProblems(rows: readonly CatalogRow[], side: 'free' | 'pro', exported: readonly string[]): string[] {
  const listed = catalogExports(rows, side);
  const problems: string[] = [];
  const known = new Set(exported);
  for (const name of exported) if (!listed.includes(name)) problems.push(`${name}: exported but missing from the ${side} column`);
  for (const name of new Set(listed)) {
    if (!known.has(name)) problems.push(`${name}: in the ${side} column but not exported`);
    if (listed.filter((n) => n === name).length > 1) problems.push(`${name}: listed more than once in the ${side} column`);
  }
  for (const row of rows) for (const entry of row[side]) if (entry.exports.length === 0) problems.push(`${row.area} / ${entry.label}: an item with no export`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------------
// Size: the baselines of the bundle budget (scripts/bundle-budget.mjs), as committed.
// ---------------------------------------------------------------------------------------------------------

/** The shape of a `bundle-budget*.json` file. */
export interface BudgetFile {
  exports: Record<string, { baseline: number; limit: number }>;
}

/** One budgeted entry: the specifier a consumer imports and its baseline file. */
export interface BudgetEntry {
  specifier: string;
  budget: BudgetFile;
}

/** The budgeted entries, in the order the section lists them, with the file each one is read from. */
export const BUDGET_FILES: readonly { specifier: string; file: string }[] = [
  { specifier: '@formrail/core', file: 'packages/core/bundle-budget.json' },
  { specifier: '@formrail/pro', file: 'packages/pro/bundle-budget.json' },
  { specifier: '@formrail/pro/engine', file: 'packages/pro/bundle-budget.engine.json' },
  { specifier: '@formrail/pro/react-hook-form', file: 'packages/pro/bundle-budget.react-hook-form.json' },
  { specifier: '@formrail/pro/tanstack-form', file: 'packages/pro/bundle-budget.tanstack-form.json' },
];

/** Bytes as the page prints them: `164 B` under 1,000, otherwise kilobytes (1 kB = 1,000 B) with one decimal. */
export function formatBytes(bytes: number): string {
  return bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(1)} kB`;
}

export interface SizeRow {
  name: string;
  bytes: number;
}

export interface EntrySummary {
  specifier: string;
  count: number;
  smallest: SizeRow;
  largest: SizeRow;
  /** Every budgeted import of the entry, by name. */
  rows: SizeRow[];
}

/** The summary of each entry, read from its baseline: the import count, the smallest and the largest import. */
export function sizeSummary(entries: readonly BudgetEntry[]): EntrySummary[] {
  return entries.map(({ specifier, budget }) => {
    const rows = Object.entries(budget.exports)
      .map(([name, { baseline }]) => ({ name, bytes: baseline }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    if (rows.length === 0) throw new Error(`${specifier}: the baseline lists no import`);
    const bySize = [...rows].sort((a, b) => a.bytes - b.bytes || a.name.localeCompare(b.name, 'en'));
    return { specifier, count: rows.length, smallest: bySize[0]!, largest: bySize[bySize.length - 1]!, rows };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Server rendering: the modules a `*.ssr.test.tsx` renders with `renderToString` (most in Node, without a DOM).
// ---------------------------------------------------------------------------------------------------------

export interface SsrModule {
  /** An export of the package, as the page prints it. */
  name: string;
  package: 'core' | 'pro';
  /** The test files, relative to the repository root. */
  files: readonly string[];
}

const core = (name: string, ...files: string[]): SsrModule => ({ name, package: 'core', files: files.map((f) => `packages/core/src/${f}`) });
const pro = (name: string, ...files: string[]): SsrModule => ({ name, package: 'pro', files: files.map((f) => `packages/pro/src/${f}`) });

/** Every `*.ssr.test.tsx` of the packages, by the module it renders on the server. Checked against the disk. */
export const SSR_MODULES: readonly SsrModule[] = [
  core('Combobox', 'combobox/Combobox.ssr.test.tsx'),
  core('useCombobox', 'combobox/use-combobox.ssr.test.tsx'),
  core('ConfirmDialog', 'confirm-dialog/ConfirmDialog.ssr.test.tsx'),
  core('ValidationProvider', 'field/ValidationProvider.ssr.test.tsx'),
  core('useListReport', 'list-report/use-list-report.ssr.test.tsx'),
  core('useListReportScrollRestoration', 'list-report/use-list-report-scroll-restoration.ssr.test.tsx'),
  core('useListReportUrlState', 'list-report/use-list-report-url-state.ssr.test.tsx'),
  core('MultiSelect', 'multi-select/MultiSelect.ssr.test.tsx'),
  core('NumberInput', 'number-input/NumberInput.ssr.test.tsx'),
  core('ObjectPage', 'object-page/ObjectPage.ssr.test.tsx'),
  core('useDirtyGuard', 'object-page/use-dirty-guard.ssr.test.tsx'),
  core('useFocusFirstInvalidField', 'object-page/use-focus-first-invalid-field.ssr.test.tsx'),
  core(
    'useObjectPageForm',
    'object-page/use-object-page-form.ssr.test.tsx',
    'object-page/use-object-page-form.schema.ssr.test.tsx',
    'object-page/use-object-page-form.validate.ssr.test.tsx',
  ),
  core('Textarea', 'textarea/Textarea.ssr.test.tsx'),
  core('ToastProvider', 'toast/Toast.ssr.test.tsx'),
  pro('useFormRebase', 'form-rebase/use-form-rebase.ssr.test.tsx'),
  pro('useReactHookFormBinding', 'integrations/react-hook-form/use-react-hook-form-binding.ssr.test.tsx'),
  pro('useTanStackFormBinding', 'integrations/tanstack-form/use-tanstack-form-binding.ssr.test.tsx'),
  pro('VirtualListReportTable', 'list-report/VirtualListReportTable.ssr.test.tsx'),
];

/** The issue that tracks the `"use client"` directive and the page on server rendering and frameworks. */
export const SSR_FRAMEWORKS_ISSUE = 'https://github.com/Utumno1984/formrail/issues/412';
