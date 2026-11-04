import type { Locator, Page } from '@playwright/test';

export const STORY = 'foundations-interaction-states--playground';

export interface Look {
  background: string;
  border: string;
  color: string;
  decoration: string;
  cursor: string;
  transition: string;
  rect: string;
}

/** The computed properties that carry the affordance, plus the box (no layout shift allowed). */
export function look(el: Locator): Promise<Look> {
  return el.evaluate((node) => {
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    return {
      background: cs.backgroundColor,
      border: cs.borderTopColor,
      color: cs.color,
      decoration: cs.textDecorationLine,
      cursor: cs.cursor,
      transition: cs.transitionDuration,
      rect: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100).join(','),
    };
  });
}

/** What the user can tell apart: everything but the cursor, the transition and the box. */
export const paint = (l: Look): string => [l.background, l.border, l.color, l.decoration].join('|');

export interface Surface {
  name: string;
  /** The element whose computed style is read. */
  measure: (page: Page) => Locator;
  /** Where the pointer goes (the label text for Checkbox / Switch / Radio). Default: `measure`. */
  target?: (page: Page) => Locator;
  /** The control is a selected pill / checked box: hover must not change it (pill only). */
  noHoverChange?: boolean;
  /** The pressed look must differ from the hover look. */
  pressedDiffersFromHover?: boolean;
}

const g = (id: string, page: Page): Locator => page.getByTestId(id);

export const SURFACES: Surface[] = [
  { name: 'Button primary', measure: (p) => g('buttons', p).getByRole('button', { name: 'Primary' }) },
  { name: 'Button secondary', measure: (p) => g('buttons', p).getByRole('button', { name: 'Secondary' }) },
  { name: 'Button ghost', measure: (p) => g('buttons', p).getByRole('button', { name: 'Ghost' }) },
  { name: 'Button danger', measure: (p) => g('buttons', p).getByRole('button', { name: 'Danger' }) },
  { name: 'Button asChild without href', measure: (p) => g('buttons', p).getByText('As child, no href') },
  { name: 'Select trigger', measure: (p) => g('controls', p).locator('button[role="combobox"]') },
  {
    name: 'Checkbox (checked)',
    measure: (p) => g('controls', p).getByRole('checkbox'),
    target: (p) => g('controls', p).getByText('Accept the terms'),
  },
  {
    name: 'Switch (off)',
    measure: (p) => g('controls', p).getByRole('switch'),
    target: (p) => g('controls', p).getByText('Notifications'),
  },
  {
    name: 'Radio (selected)',
    measure: (p) => g('controls', p).getByRole('radio', { name: /First/ }),
    target: (p) => g('controls', p).getByText('First'),
  },
  {
    name: 'Radio (not selected)',
    measure: (p) => g('controls', p).getByRole('radio', { name: /Second/ }),
    target: (p) => g('controls', p).getByText('Second'),
  },
  // The story's play function selects "Pending" (it clicks it), so "Approved" is the unselected one.
  { name: 'Filter pill (not selected)', measure: (p) => g('list-report', p).getByRole('radio', { name: 'Approved' }) },
  { name: 'Sortable header', measure: (p) => g('list-report', p).getByRole('button', { name: /Customer/ }) },
  { name: 'Anchor bar link', measure: (p) => g('anchor-bar', p).getByRole('link', { name: 'Items' }) },
  { name: 'Breadcrumb link', measure: (p) => g('breadcrumb', p).getByRole('link', { name: 'Home' }), pressedDiffersFromHover: true },
  { name: 'Breadcrumb link asChild without href', measure: (p) => g('breadcrumb', p).getByText('Invoices (as child, no href)') },
];

export const SELECTED_PILL: Surface = {
  name: 'Filter pill (selected)',
  measure: (p) => g('list-report', p).getByRole('radio', { name: 'Pending' }),
  noHoverChange: true,
};

/**
 * Moves the mouse away from every surface (hover gone), into the empty space right of the story's
 * 720px column and away from the viewport edges: near an edge a held button would start the
 * browser's selection autoscroll and shift the page under the measured boxes.
 */
export async function leave(page: Page): Promise<void> {
  await page.mouse.move(1000, 400);
}
