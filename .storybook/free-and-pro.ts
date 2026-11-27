// The data of the "Free and Pro" section of the Introduction (ticket #723). Pure: no JSON import, no Storybook
// runtime, so the Vitest guard (scripts/free-and-pro.test.mjs) and the e2e
// (e2e/introduction.spec.ts) read the same rules the page renders with (.storybook/free-and-pro-blocks.tsx).
//
// What keeps it honest:
// - every runtime export of `@formrail/core` is in exactly one Free item, every runtime export of every public
//   entry of `@formrail/pro` (`.`, `./engine`, `./react-hook-form`, `./tanstack-form`) in exactly one Pro item,
//   and an item names only exports that exist: a new export left out of the table, or a Pro item with nothing
//   built behind it (#491), fails the guard;
// - every item links to a Docs page that exists, of its own package.
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

