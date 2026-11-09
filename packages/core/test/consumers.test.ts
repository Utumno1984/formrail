// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

function run(file: string): string[] {
  const out = execFileSync(process.execPath, [join(fixtures, file)], {
    cwd: resolve(here, '..'),
    encoding: 'utf8',
  });
  return JSON.parse(out) as string[];
}

const EXPORTS = [
  'Accordion',
  'AccordionContent',
  'AccordionItem',
  'AccordionTrigger',
  'Avatar',
  'Breadcrumb',
  'BreadcrumbItem',
  'BreadcrumbLink',
  'BreadcrumbPage',
  'Button',
  'Calendar',
  'Card',
  'CardBody',
  'CardDescription',
  'CardFooter',
  'CardHeader',
  'CardTitle',
  'Checkbox',
  'Collapsible',
  'CollapsibleContent',
  'CollapsibleTrigger',
  'Combobox',
  'ConfirmDialog',
  'DatePicker',
  'DescriptionList',
  'DescriptionListItem',
  'DescriptionListStatus',
  'Dialog',
  'DialogBody',
  'DialogClose',
  'DialogContent',
  'DialogDescription',
  'DialogFooter',
  'DialogHeader',
  'DialogTitle',
  'DialogTrigger',
  'Divider',
  'Field',
  'FieldMessage',
  'FileUpload',
  'Icon',
  'Input',
  'ListReport',
  'ListReportFilterBar',
  'ListReportTable',
  'Menu',
  'MenuContent',
  'MenuGroup',
  'MenuItem',
  'MenuLabel',
  'MenuSeparator',
  'MenuTrigger',
  'MessageStrip',
  'MultiSelect',
  'ObjectPage',
  'ObjectPageFooter',
  'ObjectPageHeader',
  'ObjectPageSection',
  'Pagination',
  'ProgressBar',
  'RadioGroup',
  'RadioGroupItem',
  'Select',
  'Sheet',
  'SheetBody',
  'SheetClose',
  'SheetContent',
  'SheetDescription',
  'SheetFooter',
  'SheetHeader',
  'SheetTitle',
  'SheetTrigger',
  'Skeleton',
  'Spinner',
  'StatusBadge',
  'Switch',
  'Tabs',
  'TabsContent',
  'TabsList',
  'TabsTrigger',
  'Text',
  'Textarea',
  'Title',
  'ToastProvider',
  'Tooltip',
  'TooltipProvider',
  'TruncatedText',
  'ValidationProvider',
  'cn',
  'composeRefs',
  'defaultComboboxFilter',
  'getErrorSummary',
  'useCombobox',
  'useConfirmDialog',
  'useDirtyGuard',
  'useFieldControl',
  'useFocusFirstInvalidField',
  'useListReport',
  'useListReportScrollRestoration',
  'useListReportUrlState',
  'useObjectPageForm',
  'useToast',
];

describe('built package consumers (requires a prior `npm run build`)', () => {
  it('a CommonJS consumer can require the public export from dist', () => {
    expect(run('consumer.cjs')).toEqual(EXPORTS);
  });

  it('an ESM consumer can import the public export from dist', () => {
    expect(run('consumer.mjs')).toEqual(EXPORTS);
  });
});
