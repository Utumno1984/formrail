import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Avatar } from '../avatar/Avatar';
import { Button } from '../button/Button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog/Dialog';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { exampleStory } from '../internal/example-story';
import { CLASS_NAME_ARG, storyControl, withoutControls } from '../internal/story-docs';
import { ListReport } from '../list-report/ListReport';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/Menu';
import type { ListReportColumn } from '../list-report/types';
import { useListReport } from '../list-report/use-list-report';
import { useListReportScrollRestoration } from '../list-report/use-list-report-scroll-restoration';
import { ObjectPage } from '../object-page/ObjectPage';
import { ObjectPageFooter } from '../object-page/ObjectPageFooter';
import { ObjectPageHeader } from '../object-page/ObjectPageHeader';
import { ObjectPageSection } from '../object-page/ObjectPageSection';
import { ToastProvider } from '../toast/ToastProvider';
import { useToast } from '../toast/use-toast';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { useDirtyGuard } from '../object-page/use-dirty-guard';
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  AppShellNav,
  AppShellNavLink,
  AppShellNavTrigger,
  type AppShellProps,
} from './AppShell';

// Neutral data only: the shell knows nothing about what the app is.
const SECTION_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
const sections = (count: number) => SECTION_NAMES.slice(0, count).map((name) => ({ id: name.toLowerCase(), label: `Section ${name}` }));

const LONG = 'with a very long name that never fits on one line of the header';

// Inline styles: the stories are not scanned by Tailwind, so a class only used here would not exist.
const PAGE: CSSProperties = { padding: 24, display: 'grid', gap: 16, alignContent: 'start' };
const BLOCK: CSSProperties = {
  height: 160,
  borderRadius: 8,
  padding: 12,
  background: 'var(--color-rop-blue-50, #eef5fc)',
  boxSizing: 'border-box',
};
const TITLE: CSSProperties = { margin: 0, fontSize: 'var(--text-rop-title-md)', lineHeight: 'var(--text-rop-title-md--line-height)' };

/**
 * A plain page, `blocks` blocks tall, each with a link (so the scrolled content has stops of its own). With a
 * `headingRef` its heading can take the focus (as the page a router opens).
 */
function PlainPage({ title, blocks, headingRef }: { title: string; blocks: number; headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <div style={PAGE}>
      <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} style={TITLE}>
        {title}
      </h1>
      {Array.from({ length: blocks }, (_, i) => (
        <div key={i} style={BLOCK}>
          Block {i + 1} of {title}. <a href={`#block-${i + 1}`}>Details of block {i + 1}</a>
        </div>
      ))}
    </div>
  );
}

/**
 * Identity at the start, the current context in the middle, the user at the end (all neutral). With `trigger`, the
 * trigger of the navigation Sheet comes first (displayed below 64rem only): every story with an `AppShellNav` has
 * it (#721), or below 64rem its navigation could not be reached.
 */
function headerSlots({ long = false, trigger = false }: { long?: boolean; trigger?: boolean }) {
  const name = <TruncatedText style={{ fontWeight: 600 }}>{long ? `App one ${LONG}` : 'App one'}</TruncatedText>;
  return {
    start: trigger ? (
      <>
        <AppShellNavTrigger />
        {name}
      </>
    ) : (
      name
    ),
    center: <TruncatedText>{long ? `Context one ${LONG}` : 'Context one'}</TruncatedText>,
    end: (
      <>
        <TruncatedText>{long ? `User one ${LONG}` : 'User one'}</TruncatedText>
        <Avatar name="User one" size="sm" decorative />
      </>
    ),
  };
}

interface DemoArgs extends Pick<AppShellProps, 'fill' | 'labels' | 'className'> {
  /** Number of links in the navigation (story control). */
  navCount: number;
  /** The link of the current page (story control). */
  activeItem: string;
  /** Long texts in the three parts of the header (story control). */
  longHeaderText: boolean;
  /** A page much taller than the window (story control). */
  longContent: boolean;
  /** Called by every navigation link (plain click or Enter), with the link's id. */
  onNavigate: (id: string) => void;
}

/** What the compact-navigation stories add to the demo (not story controls). */
interface CompactOptions {
  /** `AppShellNavTrigger` at the start of the header. Default: whenever the demo has a navigation. */
  trigger?: boolean;
  /** Runs the navigation of a link (through a dirty guard, for example); by default it runs at once. */
  guard?: (navigate: () => void) => void;
  /** `onNavigate` moves the focus to the heading of the new page, as a router does. */
  focusHeading?: boolean;
  /** List items after the links of the navigation. */
  navEnd?: ReactNode;
  /** Content above the page. */
  before?: ReactNode;
}

/** The shell with a navigation whose current link follows the user's choice. */
function Demo({
  navCount,
  activeItem,
  longHeaderText,
  longContent,
  onNavigate,
  compact = {},
  ...shell
}: DemoArgs & { compact?: CompactOptions }) {
  const items = sections(navCount);
  const [active, setActive] = useState(activeItem);
  useEffect(() => setActive(activeItem), [activeItem]);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = items.find((item) => item.id === active);
  const run = compact.guard ?? ((navigate: () => void) => navigate());
  return (
    <AppShell {...shell}>
      <AppShellHeader {...headerSlots({ long: longHeaderText, trigger: compact.trigger ?? items.length > 0 })} />
      {items.length > 0 ? (
        <AppShellNav>
          {items.map((item) => (
            <AppShellNavLink
              key={item.id}
              href={`#${item.id}`}
              active={item.id === active}
              onNavigate={() =>
                run(() => {
                  setActive(item.id);
                  onNavigate(item.id);
                  if (compact.focusHeading) heading.current?.focus();
                })
              }
            >
              {item.label}
            </AppShellNavLink>
          ))}
          {compact.navEnd}
        </AppShellNav>
      ) : null}
      <AppShellMain>
        {compact.before}
        <PlainPage
          title={current?.label ?? 'Home'}
          blocks={longContent ? 12 : 2}
          headingRef={compact.focusHeading ? heading : undefined}
        />
      </AppShellMain>
    </AppShell>
  );
}

const meta: Meta<DemoArgs> = {
  title: 'Floorplans/App Shell',
  component: AppShell as never,
  subcomponents: { AppShellHeader, AppShellNavTrigger, AppShellNav, AppShellNavLink, AppShellMain } as never,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    fill: { control: 'radio', options: ['viewport', 'parent'] },
    labels: { control: 'object' },
    className: CLASS_NAME_ARG,
    ...withoutControls('children'),
    navCount: storyControl({
      control: { type: 'range', min: 0, max: 20, step: 1 },
      description: 'Number of `AppShellNavLink`s in the `AppShellNav` ("Section A"…); 0 renders no navigation.',
    }),
    activeItem: storyControl({
      control: 'select',
      options: SECTION_NAMES.map((name) => name.toLowerCase()),
      description: 'The link rendered `active` (`aria-current="page"`) until the user picks another one.',
    }),
    longHeaderText: storyControl({
      control: 'boolean',
      description: 'Long texts in the `start`, `center` and `end` parts of `AppShellHeader` (cut with an ellipsis).',
    }),
    longContent: storyControl({ control: 'boolean', description: 'A page much taller than the window in `AppShellMain`.' }),
    onNavigate: storyControl({ control: false, description: "`onNavigate` of every `AppShellNavLink`, with the link's id." }),
  },
  args: { fill: 'viewport', navCount: 5, activeItem: 'a', longHeaderText: false, longContent: true, onNavigate: fn() },
  render: (args) => <Demo {...args} />,
};

export default meta;
type Story = StoryObj<DemoArgs>;

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('AppShell.example.tsx', {}, { layout: 'fullscreen' }) };

/** Whether the navigation is a column at the current width (below the breakpoint it is not displayed). */
const navShown = (nav: HTMLElement) => nav.ownerDocument.defaultView!.getComputedStyle(nav).display !== 'none';

/**
 * Controls: number of links, the current one, long texts in the header, long content. The play function uses
 * the keyboard only: Tab reaches the skip link first (visible once focused), Enter moves the focus to the content;
 * then, with the navigation displayed (from 64rem), Shift+Tab goes back to the last link and Enter opens it:
 * `onNavigate` gets its id and `aria-current` moves to it.
 */
export const Playground: Story = {
  tags: ['playground'],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const main = canvas.getByRole('main');
    await userEvent.tab();
    const skip = canvas.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toHaveFocus();
    await waitFor(() => expect(getComputedStyle(skip).opacity).toBe('1'));
    await userEvent.keyboard('{Enter}');
    await expect(main).toHaveFocus();
    const nav = canvas.getByRole('navigation', { name: 'Main' });
    if (!navShown(nav) || args.navCount === 0) return;
    const links = within(nav).getAllByRole('link');
    const last = links[links.length - 1]!;
    await userEvent.tab({ shift: true });
    await expect(last).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onNavigate).toHaveBeenCalledTimes(1);
    await expect(args.onNavigate).toHaveBeenCalledWith(SECTION_NAMES[args.navCount - 1]!.toLowerCase());
    await waitFor(() => expect(last).toHaveAttribute('aria-current', 'page'));
    await expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
  },
};

/** Visual: a plain page much taller than the window; only the content scrolls. */
export const LongPage: Story = { tags: ['visual'], args: { longContent: true } };

/** Visual: no `AppShellNav` (a single-page app): the content takes the whole width at every size. */
export const WithoutNav: Story = { tags: ['visual'], args: { navCount: 0, longContent: false } };

/**
 * Visual: long texts in every part of the header and in the links: all cut with an ellipsis at their real width,
 * and the page never gets wider than the window.
 */
export const LongTexts: Story = {
  tags: ['visual'],
  args: { longHeaderText: true, longContent: false },
  render: (args) => (
    <AppShell fill={args.fill}>
      <AppShellHeader {...headerSlots({ long: true, trigger: true })} />
      <AppShellNav>
        <AppShellNavLink href="#a" active>
          Section A {LONG}
        </AppShellNavLink>
        <AppShellNavLink href="#b">Section B {LONG}</AppShellNavLink>
        <AppShellNavLink href="#c" disabled>
          Section C, not available
        </AppShellNavLink>
      </AppShellNav>
      <AppShellMain>
        <PlainPage title="Section A" blocks={2} />
      </AppShellMain>
    </AppShell>
  ),
};

/** Visual: the shell in a box of its own (`fill="parent"`), such as a demo or a frame, instead of the window. */
export const InABox: Story = {
  tags: ['visual'],
  args: { fill: 'parent', longContent: true },
  render: (args) => (
    <div style={{ padding: 16 }}>
      <div data-testid="box" style={{ height: 420, border: '1px solid var(--color-rop-border)' }}>
        <Demo {...args} />
      </div>
    </div>
  ),
};

/** More links than the column has room for: the navigation scrolls on its own, the header and the content stay. */
export const ManyLinks: Story = { args: { navCount: 20, longContent: false } };

/**
 * The parts of the header arrive after the mount (the user is loaded asynchronously): the header keeps its
 * height, so the content does not move. The trigger of the navigation is there from the first render.
 */
export const HeaderLoadsLater: Story = {
  args: { longContent: false },
  render: function Render() {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      const timer = setTimeout(() => setLoaded(true), 600);
      return () => clearTimeout(timer);
    }, []);
    return (
      <AppShell>
        {/* Same structure before and after (a fragment: the trigger, then the name), so the trigger is not remounted. */}
        <AppShellHeader {...(loaded ? headerSlots({ trigger: true }) : { start: <><AppShellNavTrigger />{null}</> })} />
        <AppShellNav>
          <AppShellNavLink href="#a" active>
            Section A
          </AppShellNavLink>
        </AppShellNav>
        <AppShellMain>
          <PlainPage title={loaded ? 'Loaded' : 'Loading'} blocks={2} />
        </AppShellMain>
      </AppShell>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText('User one')).toBeInTheDocument(), { timeout: 3000 });
  },
};

// --- Compact navigation (below 64rem) ------------------------------------------------------------------------

/** Whether an element is displayed at the current width (the trigger is not, from 64rem up). */
const displayed = (element: HTMLElement) => element.ownerDocument.defaultView!.getComputedStyle(element).display !== 'none';
/**
 * The trigger, found also where it is not displayed (from 64rem: an element that is not displayed has no accessible
 * name, so it is found by its marker) or hidden by an open Sheet.
 */
const navTrigger = (canvasElement: HTMLElement) => {
  const trigger = canvasElement.querySelector<HTMLElement>('[data-rop-app-shell-nav-trigger]');
  if (!trigger) throw new Error('No AppShellNavTrigger in the story');
  return trigger;
};
/** The Mobile viewport of the toolbar: on a canvas from 64rem the trigger is not displayed and the column is there. */
const MOBILE = { viewport: { value: 'mobile', isRotated: false } };

/**
 * Below 64rem (a tablet held upright, a phone) the column is not displayed: `AppShellNavTrigger`, at the start of the
 * header, opens the same navigation in a Sheet. The story opens with the Mobile viewport; the controls are the
 * Playground's. The play function uses the keyboard only: Tab past the skip link reaches the trigger, Enter opens the
 * Sheet titled "Main" with the focus on the current link, Tab moves to the next one, and Enter closes the Sheet, gives
 * the focus back to the trigger and only then calls `onNavigate` (the page shows the new section). From 64rem up the
 * trigger is not displayed: the play function checks that and stops.
 */
export const CompactNavigation: Story = {
  tags: ['visual'],
  args: { longContent: false },
  globals: MOBILE,
  render: (args) => <Demo {...args} compact={{ trigger: true }} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = navTrigger(canvasElement);
    if (!displayed(trigger) || args.navCount < 2) {
      await expect(trigger).not.toBeVisible();
      return;
    }
    // The current link (the first one when `activeItem` is past the last link), then its neighbour: the next one, or
    // the previous one when it is the last (Tab from the last link goes round to the close button).
    const items = sections(args.navCount);
    const index = Math.max(0, items.findIndex((item) => item.id === args.activeItem));
    const current = items[index]!;
    const step = index < items.length - 1 ? 1 : -1;
    const next = items[index + step]!;
    await userEvent.tab();
    await expect(canvas.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{Enter}');
    const sheet = await body.findByRole('dialog', { name: 'Main' });
    await expect(trigger).toHaveAttribute('aria-controls', sheet.id);
    await waitFor(() => expect(within(sheet).getByRole('link', { name: current.label })).toHaveFocus());
    await userEvent.tab({ shift: step < 0 });
    await expect(within(sheet).getByRole('link', { name: next.label })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onNavigate).toHaveBeenCalledTimes(1);
    await expect(args.onNavigate).toHaveBeenCalledWith(next.id);
    await expect(trigger).toHaveFocus();
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(trigger).toHaveFocus();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(next.label);
  },
};

/** Visual: the navigation Sheet open below 64rem, with the focus on the current link (from 64rem: the column). */
export const CompactNavigationOpen: Story = {
  tags: ['visual'],
  args: { longContent: false, activeItem: 'b' },
  globals: MOBILE,
  render: (args) => <Demo {...args} compact={{ trigger: true }} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = navTrigger(canvasElement);
    if (!displayed(trigger)) return;
    await userEvent.click(trigger);
    const sheet = await body.findByRole('dialog', { name: 'Main' });
    await waitFor(() => expect(within(sheet).getByRole('link', { name: 'Section B' })).toHaveFocus());
  },
};

/**
 * What a router does: `onNavigate` shows the new page and moves the focus to its heading. The Sheet, which gives the
 * focus back after its exit animation, leaves it on the heading. The play function opens the Sheet, chooses
 * "Section C" and checks the focus once the Sheet has gone.
 */
export const CompactNavigationFocusOnTheNewPage: Story = {
  args: { longContent: false },
  globals: MOBILE,
  render: (args) => <Demo {...args} compact={{ trigger: true, focusHeading: true }} />,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = navTrigger(canvasElement);
    if (!displayed(trigger) || args.navCount < 3) return;
    await userEvent.click(trigger);
    const sheet = await body.findByRole('dialog', { name: 'Main' });
    await userEvent.click(within(sheet).getByRole('link', { name: 'Section C' }));
    const heading = canvasElement.querySelector('h1')!;
    await expect(heading).toHaveFocus();
    await expect(heading).toHaveTextContent('Section C');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    // A frame after the Sheet has left the DOM: the moment its return of the focus would run.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await expect(heading).toHaveFocus();
    await expect(args.onNavigate).toHaveBeenCalledTimes(1);
  },
};

/** A field whose change makes `useDirtyGuard` ask before a link of the navigation is followed. */
function GuardedDemo(args: DemoArgs) {
  const [value, setValue] = useState('First value');
  const { guard, dialog } = useDirtyGuard({ when: value !== 'First value' });
  return (
    <>
      <Demo
        {...args}
        compact={{
          trigger: true,
          guard,
          before: (
            <div style={{ padding: '24px 24px 0', maxWidth: 320 }}>
              <Field label="Name" name="name">
                <Input value={value} onChange={(event) => setValue(event.target.value)} />
              </Field>
            </div>
          ),
        }}
      />
      {dialog}
    </>
  );
}

/**
 * The links go through `useDirtyGuard`: after a change in the field, choosing a link of the Sheet asks first. The Sheet
 * is already closed when the question comes; "Keep editing" returns the focus to the trigger and the page stays,
 * "Leave without saving" opens the section. The play function changes the field, chooses "Section B" and keeps
 * editing.
 */
export const CompactNavigationWithDirtyGuard: Story = {
  args: { longContent: false },
  globals: MOBILE,
  render: (args) => <GuardedDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = navTrigger(canvasElement);
    if (!displayed(trigger) || args.navCount < 2) return;
    await userEvent.type(canvas.getByRole('textbox', { name: 'Name' }), ' changed');
    await userEvent.click(trigger);
    const sheet = await body.findByRole('dialog', { name: 'Main' });
    await userEvent.click(within(sheet).getByRole('link', { name: 'Section B' }));
    const question = await body.findByRole('dialog', { name: 'Unsaved changes' });
    await expect(canvasElement.ownerDocument.querySelector('[data-rop-app-shell-nav-sheet][data-state="open"]')).toBeNull();
    await userEvent.click(within(question).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(args.onNavigate).not.toHaveBeenCalled();
  },
};

/**
 * More links than the Sheet holds, and a search field of the consumer at the end of the navigation: the links scroll
 * inside the Sheet (the page does not), and with the virtual keyboard open the focused field stays above it (the
 * Sheet is as tall as the visible viewport). The play function opens the Sheet and focuses the field.
 */
export const CompactNavigationWithManyLinks: Story = {
  args: { longContent: false, navCount: 20 },
  globals: MOBILE,
  render: (args) => (
    <Demo
      {...args}
      compact={{
        trigger: true,
        navEnd: (
          <li style={{ padding: '8px 12px' }}>
            <Field label="Search the sections">
              <Input type="search" />
            </Field>
          </li>
        ),
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = navTrigger(canvasElement);
    if (!displayed(trigger)) return;
    await userEvent.click(trigger);
    const sheet = await body.findByRole('dialog', { name: 'Main' });
    const search = within(sheet).getByRole('searchbox', { name: 'Search the sections' });
    await userEvent.click(search);
    await expect(search).toHaveFocus();
  },
};

// --- Floorplans inside the shell --------------------------------------------------------------------------

interface Row {
  id: string;
  name: string;
  group: string;
  amount: number;
}

const ROWS: Row[] = Array.from({ length: 60 }, (_, i) => ({
  id: `R-${String(i + 1).padStart(3, '0')}`,
  name: `Record ${i + 1}`,
  group: `Group ${['one', 'two', 'three'][i % 3]}`,
  amount: 100 + ((i * 37) % 900),
}));

function RecordList() {
  const columns = useMemo<ListReportColumn<Row>[]>(
    () => [
      { id: 'id', header: 'Code', accessor: (row) => row.id, width: 110 },
      { id: 'name', header: 'Name', accessor: (row) => row.name, minWidth: 160 },
      { id: 'group', header: 'Group', accessor: (row) => row.group, width: 140 },
      { id: 'amount', header: 'Amount', accessor: (row) => row.amount, align: 'end', width: 110 },
    ],
    [],
  );
  const table = useListReport({ rows: ROWS, columns, getRowId: (row) => row.id });
  const scroll = useListReportScrollRestoration({ ready: true, key: 'app-shell-story' });
  return (
    <div style={{ height: '100%', boxSizing: 'border-box', padding: 16 }}>
      <ListReport title="Records" table={table} scrollerRef={scroll.ref} actions={<Button variant="primary">New record</Button>} />
    </div>
  );
}

/**
 * Visual: a List Report in the content. It takes the height of the content and its table is the only scroller;
 * the header and the navigation stay where they are. "Section B" opens another page, and coming back to
 * "Section A" puts the table back where it was (`useListReportScrollRestoration`, unchanged inside the shell).
 */
export const WithListReport: Story = {
  tags: ['visual'],
  render: function Render(args) {
    const [page, setPage] = useState<'a' | 'b'>('a');
    return (
      <AppShell>
        <AppShellHeader {...headerSlots({ trigger: true })} />
        <AppShellNav>
          {(['a', 'b'] as const).map((id) => (
            <AppShellNavLink
              key={id}
              href={`#${id}`}
              active={page === id}
              onNavigate={() => {
                setPage(id);
                args.onNavigate(id);
              }}
            >
              Section {id.toUpperCase()}
            </AppShellNavLink>
          ))}
        </AppShellNav>
        <AppShellMain>{page === 'a' ? <RecordList /> : <PlainPage title="Section B" blocks={1} />}</AppShellMain>
      </AppShell>
    );
  },
};

function Filler({ height, children }: { height: number; children: ReactNode }) {
  return <div style={{ ...BLOCK, height }}>{children}</div>;
}

/**
 * Visual: an Object Page in the content, with its save bar. The page's own scroller is the only one; the save bar
 * keeps its room at the bottom of the content, below the sections, never under the header.
 */
export const WithObjectPage: Story = {
  tags: ['visual'],
  render: () => (
    <AppShell>
      <AppShellHeader {...headerSlots({ trigger: true })} />
      <AppShellNav>
        <AppShellNavLink href="#a" active>
          Section A
        </AppShellNavLink>
        <AppShellNavLink href="#b">Section B</AppShellNavLink>
      </AppShellNav>
      <AppShellMain>
        <ObjectPage>
          <ObjectPageHeader title="Record 1" subtitle="Group one" />
          {['General', 'Details', 'Notes', 'History'].map((title, i) => (
            <ObjectPageSection key={title} id={`op-${i + 1}`} title={title}>
              <Filler height={140 + (i % 2) * 120}>Content of {title}</Filler>
              {i === 3 ? (
                <Field label="Last field">
                  <Input />
                </Field>
              ) : null}
            </ObjectPageSection>
          ))}
          <ObjectPageFooter visible message="Unsaved changes">
            <Button variant="ghost">Cancel</Button>
            <Button variant="primary">Save</Button>
          </ObjectPageFooter>
        </ObjectPage>
      </AppShellMain>
    </AppShell>
  ),
};

function FormFields() {
  return (
    <>
      <h1 style={TITLE}>Form</h1>
      <Filler height={420}>Content above the form</Filler>
      {['First field', 'Second field', 'Last field'].map((label) => (
        <Field key={label} label={label}>
          <Input />
        </Field>
      ))}
    </>
  );
}

/**
 * A form whose last field is at the bottom of a page taller than the window: with the virtual keyboard open
 * (a phone), the focused field is kept above the keyboard and the header stays at the top.
 */
export const FormAtTheBottom: Story = {
  render: () => (
    <AppShell>
      <AppShellHeader {...headerSlots({})} />
      <AppShellMain>
        <div style={PAGE}>
          <FormFields />
        </div>
      </AppShellMain>
    </AppShell>
  ),
};

/**
 * The same form with the padding on `AppShellMain` itself (`style={{ padding: 24 }}`): the padding is kept whole,
 * the bottom one too, and the virtual keyboard's room is added below it.
 */
export const FormInAPaddedContent: Story = {
  render: () => (
    <AppShell>
      <AppShellHeader {...headerSlots({})} />
      <AppShellMain style={PAGE}>
        <FormFields />
      </AppShellMain>
    </AppShell>
  ),
};

function Overlays() {
  const toast = useToast();
  return (
    <div style={{ ...PAGE, gridAutoFlow: 'column', justifyContent: 'start' }}>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="primary">Open dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog over the shell</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <p style={{ margin: 0 }}>The dialog and its backdrop cover the header too.</p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="secondary" onClick={() => toast.show({ tone: 'info', description: 'A toast over the shell' })}>
        Show toast
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary">Open menu</Button>
        </MenuTrigger>
        {/* Opens upwards, over the header (no flip to the free side below). */}
        <MenuContent side="top" avoidCollisions={false}>
          <MenuItem>Action over the header</MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

/**
 * A dialog, a toast and a menu opened from the content are above the header (the menu opens upwards, over it): the
 * shell adds no layer of its own.
 */
export const OverlaysAboveTheHeader: Story = {
  render: () => (
    <ToastProvider>
      <AppShell>
        <AppShellHeader {...headerSlots({})} />
        <AppShellMain>
          <Overlays />
        </AppShellMain>
      </AppShell>
    </ToastProvider>
  ),
};
