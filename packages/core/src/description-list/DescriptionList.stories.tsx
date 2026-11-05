import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../sheet/Sheet';
import { Text } from '../typography/Text';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { internalIcons } from '../internal/icons';
import { StatusBadge,type StatusBadgeTone } from '../status-badge/StatusBadge';
import { DescriptionList, DescriptionListItem, type DescriptionListLayout } from './DescriptionList';
import { DescriptionListStatus } from './DescriptionListStatus';

type ValueKind = 'strings' | 'mixed' | 'with-empties';

const BORDER = '1px dashed var(--color-rop-border)';
const LONG_WORD = 'A'.repeat(200);

function Items({ kind, onOpen }: { kind: ValueKind; onOpen?: () => void }): ReactNode {
  if (kind === 'strings') {
    return (
      <>
        <DescriptionListItem label="Fornitore">Acme S.r.l.</DescriptionListItem>
        <DescriptionListItem label="Numero">INV-2026-0142</DescriptionListItem>
        <DescriptionListItem label="Importo totale">1.240,00 €</DescriptionListItem>
        <DescriptionListItem label="Scadenza">30/11/2026</DescriptionListItem>
      </>
    );
  }
  if (kind === 'with-empties') {
    return (
      <>
        <DescriptionListItem label="Fornitore">Acme S.r.l.</DescriptionListItem>
        <DescriptionListItem label="Note">{null}</DescriptionListItem>
        <DescriptionListItem label="Riferimento">{''}</DescriptionListItem>
        <DescriptionListItem label="Allegati">{0}</DescriptionListItem>
        <DescriptionListItem label="Approvato">{false}</DescriptionListItem>
      </>
    );
  }
  return (
    <>
      <DescriptionListItem label="Fornitore">Acme S.r.l.</DescriptionListItem>
      <DescriptionListItem label="Sito">
        <a href="#acme">acme.example</a>
      </DescriptionListItem>
      <DescriptionListItem label="Codice">
        <Text as="span" mono>
          INV-2026-0142
        </Text>
      </DescriptionListItem>
      <DescriptionListItem label="Azione">
        <Button size="inline" variant="ghost" onClick={onOpen}>
          Apri fattura
        </Button>
      </DescriptionListItem>
      <DescriptionListItem label="Indirizzo">
        <div>
          Via Roma 1<br />
          20100 Milano
          <br />
          Italia
        </div>
      </DescriptionListItem>
      <DescriptionListItem label="Stato">Da approvare</DescriptionListItem>
    </>
  );
}

interface DemoProps {
  layout: DescriptionListLayout;
  /** Width of the demo container in px (the list reacts to it, not to the window). */
  width: number;
  valueKind: ValueKind;
  emptyLabel: string;
  onOpen?: () => void;
}

function Demo({ layout, width, valueKind, emptyLabel, onOpen }: DemoProps) {
  return (
    <div
      data-testid="container"
      style={{ width, maxWidth: 'calc(100% - 34px)', border: BORDER, padding: 16, boxSizing: 'content-box' }}
    >
      <DescriptionList layout={layout} emptyLabel={emptyLabel} data-testid="list">
        <Items kind={valueKind} onOpen={onOpen} />
      </DescriptionList>
    </div>
  );
}

const meta = {
  title: 'Data/DescriptionList',
  component: Demo,
  parameters: { layout: 'padded' },
  argTypes: {
    layout: { control: 'radio', options: ['auto', 'inline', 'stacked'] satisfies DescriptionListLayout[] },
    width: { control: { type: 'range', min: 200, max: 800, step: 10 } },
    valueKind: { control: 'select', options: ['strings', 'mixed', 'with-empties'] satisfies ValueKind[] },
    emptyLabel: { control: 'text' },
    onOpen: { control: false },
  },
  args: { layout: 'auto', width: 600, valueKind: 'mixed', emptyLabel: 'Not specified', onOpen: fn() },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

const rect = (el: Element) => el.getBoundingClientRect();

/**
 * Controls: layout, container width (a range), kind of values, empty label. `onOpen` shows in
 * Actions. The play function narrows the container under the threshold, checks the value drops
 * under its label, widens it again and checks the values are back beside the labels in a single
 * column (a string row and a custom-node row start at the same x).
 */
export const Playground: Story = {
  args: { layout: 'auto', width: 600, valueKind: 'mixed' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const container = canvas.getByTestId('container');
    const original = container.style.width;
    const dds = Array.from(canvasElement.querySelectorAll('dd'));
    const first = dds[0]!.closest('div')!;
    const dt = first.querySelector('dt')!;
    const dd = first.querySelector('dd')!;

    container.style.width = '250px';
    await waitFor(() => expect(rect(dd).top).toBeGreaterThanOrEqual(rect(dt).bottom - 1));
    await expect(Math.abs(rect(dd).left - rect(dt).left)).toBeLessThanOrEqual(1);

    container.style.width = '600px';
    await waitFor(() => expect(rect(dd).left).toBeGreaterThanOrEqual(rect(dt).right));
    await expect(Math.abs(rect(dd).top - rect(dt).top)).toBeLessThanOrEqual(1);
    const lefts = dds.map((d) => Math.round(rect(d).left));
    await expect(new Set(lefts).size).toBe(1);

    await userEvent.click(canvas.getByRole('button', { name: 'Apri fattura' }));
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
    container.style.width = original;
  },
};

/** Inline with mixed values: every value, string or node, starts on the same vertical line. */
export const InlineMixed: Story = {
  tags: ['visual'],
  args: { layout: 'inline', width: 600, valueKind: 'mixed' },
};

/** Stacked with mixed values: the value sits under its label, flush with it. */
export const StackedMixed: Story = {
  tags: ['visual'],
  args: { layout: 'stacked', width: 280, valueKind: 'mixed' },
};

/** `auto` in two containers side by side in the same viewport: the narrow one stacks, the wide one stays inline. */
export const AutoSideBySide: Story = {
  tags: ['visual'],
  argTypes: { width: { control: false }, layout: { control: false } },
  render: ({ valueKind, emptyLabel }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      {[600, 280].map((w) => (
        <div key={w} data-testid={`box-${w}`} style={{ width: w, maxWidth: 'calc(100% - 34px)', border: BORDER, padding: 16, boxSizing: 'content-box' }}>
          <DescriptionList emptyLabel={emptyLabel} data-testid={`list-${w}`}>
            <Items kind={valueKind} />
          </DescriptionList>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Each list follows ITS container: inline from 24rem (384px) up, stacked below. The boxes
    // shrink on a narrow viewport (max-width: 100%), so the expectation is read from their width.
    const canvas = within(canvasElement);
    const modes: string[] = [];
    for (const id of ['list-600', 'list-280']) {
      const list = canvas.getByTestId(id);
      const item = list.querySelector('div')!;
      const dt = item.querySelector('dt')!;
      const dd = item.querySelector('dd')!;
      const inline = list.getBoundingClientRect().width >= 384;
      modes.push(inline ? 'inline' : 'stacked');
      if (inline) await expect(rect(dd).left).toBeGreaterThanOrEqual(rect(dt).right);
      else await expect(rect(dd).top).toBeGreaterThanOrEqual(rect(dt).bottom - 1);
    }
    // At a desktop width the two containers really differ; that is the point of the story.
    if (window.innerWidth >= 1000) await expect(modes).toEqual(['inline', 'stacked']);
  },
};

function LongAndEmptyList({ width, layout }: { width: number; layout: DescriptionListLayout }) {
  return (
    <div data-testid={`box-${width}`} style={{ width, maxWidth: 'calc(100% - 34px)', border: BORDER, padding: 16, boxSizing: 'content-box' }}>
      <DescriptionList layout={layout} data-testid={`list-${width}`}>
        <DescriptionListItem label={LONG_WORD}>Valore con etichetta lunghissima</DescriptionListItem>
        <DescriptionListItem label="Stringa senza spazi">{LONG_WORD}</DescriptionListItem>
        <DescriptionListItem label="Troncato">
          <TruncatedText>{'Un testo molto lungo che deve essere troncato con i puntini '.repeat(3)}</TruncatedText>
        </DescriptionListItem>
        <DescriptionListItem label="Vuoto">{null}</DescriptionListItem>
        <DescriptionListItem label="Zero">{0}</DescriptionListItem>
      </DescriptionList>
    </div>
  );
}

/** Long values and long labels wrap in their own column; empty values show the placeholder. */
export const LongAndEmpty: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <LongAndEmptyList width={600} layout="inline" />
      <LongAndEmptyList width={280} layout="inline" />
      <LongAndEmptyList width={280} layout="stacked" />
    </div>
  ),
};

/** Right-to-left: in inline the labels sit on the right (start side). */
export const Rtl: Story = {
  tags: ['visual'],
  args: { layout: 'inline', width: 600, valueKind: 'mixed' },
  render: (args) => (
    <div dir="rtl">
      <Demo {...args} />
    </div>
  ),
};

const VALUE_STEPS: { name: string; value: ReactNode }[] = [
  { name: 'string', value: 'Acme S.r.l.' },
  { name: 'node', value: <a href="#acme">acme.example</a> },
  { name: 'empty', value: null },
  { name: 'multi-line', value: <div>Via Roma 1<br />20100 Milano</div> },
];

function ChangingValueDemo() {
  const [step, setStep] = useState(0);
  return (
    <div data-testid="container" style={{ width: 600, border: BORDER, padding: 16, boxSizing: 'content-box' }}>
      <Button size="sm" onClick={() => setStep((s) => (s + 1) % VALUE_STEPS.length)}>
        Cambia valore
      </Button>
      <p data-testid="step">{VALUE_STEPS[step]!.name}</p>
      <DescriptionList data-testid="list">
        <DescriptionListItem label="Variabile">{VALUE_STEPS[step]!.value}</DescriptionListItem>
        <DescriptionListItem label="Fisso">Sempre uguale</DescriptionListItem>
      </DescriptionList>
    </div>
  );
}

/** A value that changes after mount (string, node, empty, multi-line) keeps the value column. */
export const ChangingValue: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ChangingValueDemo />,
};

/** In a narrow Sheet the list follows the Sheet's width, not the window's. */
export const InNarrowSheet: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="primary">Apri</Button>
      </SheetTrigger>
      <SheetContent size="sm">
        <SheetHeader>
          <SheetTitle>Dettaglio fornitore</SheetTitle>
          <SheetDescription>Anteprima in sola lettura</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <DescriptionList data-testid="sheet-list">
            <Items kind="mixed" />
          </DescriptionList>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
};

/**
 * Edge cases for the e2e suite (not photographed): inside a flex row without width, in a table
 * cell, one item, zero items.
 */
export const EdgeCases: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <div data-testid="flex-row" style={{ display: 'flex', width: 700, border: BORDER }}>
        <DescriptionList data-testid="flex-list">
          <DescriptionListItem label="Fornitore">Acme S.r.l.</DescriptionListItem>
        </DescriptionList>
      </div>
      <table>
        <tbody>
          <tr>
            <td data-testid="cell" style={{ width: 500 }}>
              <DescriptionList data-testid="cell-list">
                <DescriptionListItem label="Fornitore">Acme S.r.l.</DescriptionListItem>
              </DescriptionList>
            </td>
          </tr>
        </tbody>
      </table>
      {/* Shrink-to-fit parents (the extra block `div` keeps the grid from stretching them). */}
      <div>
        <table>
          <tbody>
            <tr>
              <td data-testid="auto-cell">
                <DescriptionList data-testid="auto-cell-list">
                  <DescriptionListItem label="Fornitore">Acme S.r.l.</DescriptionListItem>
                </DescriptionList>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <div data-testid="shrink-wrap" style={{ display: 'inline-block' }}>
          <DescriptionList data-testid="shrink-list">
            <DescriptionListItem label="Fornitore">Acme S.r.l.</DescriptionListItem>
          </DescriptionList>
        </div>
      </div>
      <div style={{ width: 500 }}>
        <DescriptionList data-testid="empty-list" />
      </div>
    </div>
  ),
};

type Entity = 'archiviata con audit' | 'archiviata senza audit' | 'attiva, senza stato' | 'solo dettaglio';
const ENTITIES: Entity[] = ['archiviata con audit', 'archiviata senza audit', 'attiva, senza stato', 'solo dettaglio'];
const TONES: StatusBadgeTone[] = ['neutral', 'info', 'success', 'warning', 'error'];
const AUDIT = 'Archiviato il 12/10/2026 da Maria Rossi (ufficio acquisti)';
const AUDIT_ONLY = 'Ultima verifica il 03/11/2026 da Luca Bianchi (amministrazione)';

interface StatusDemoProps {
  entity: Entity;
  tone: StatusBadgeTone;
  /** Width of the demo container in px. */
  width: number;
  showSummary: boolean;
  layout: DescriptionListLayout;
  onSelect?: (entity: Entity) => void;
}

function StatusDemo({ entity: initial, tone, width, showSummary, layout, onSelect }: StatusDemoProps) {
  const [entity, setEntity] = useState<Entity>(initial);
  const [prev, setPrev] = useState(initial);
  if (prev !== initial) {
    // The `entity` control drives the demo too.
    setPrev(initial);
    setEntity(initial);
  }
  const hasBadge = entity === 'archiviata con audit' || entity === 'archiviata senza audit';
  const hasDetail = entity === 'archiviata con audit' || entity === 'solo dettaglio';
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ENTITIES.map((e) => (
          <Button
            key={e}
            size="sm"
            variant={e === entity ? 'primary' : 'secondary'}
            aria-pressed={e === entity}
            onClick={() => {
              setEntity(e);
              onSelect?.(e);
            }}
          >
            {e}
          </Button>
        ))}
      </div>
      <div data-testid="container" style={{ width, maxWidth: 'calc(100% - 34px)', border: BORDER, padding: 16, boxSizing: 'content-box' }}>
        <DescriptionListStatus
          data-testid="status"
          status={hasBadge ? <StatusBadge tone={tone}>Archiviato</StatusBadge> : undefined}
          detail={hasDetail ? (hasBadge ? AUDIT : AUDIT_ONLY) : undefined}
        />
        <div style={{ height: 12 }} />
        <DescriptionList layout={layout} data-testid="list">
          <DescriptionListItem label="Fornitore">Acme S.r.l.</DescriptionListItem>
          <DescriptionListItem label="Numero">INV-2026-0142</DescriptionListItem>
          <DescriptionListItem label="Imponibile">1.016,39 €</DescriptionListItem>
          {showSummary ? (
            <>
              <DescriptionListItem label="IVA 22%" variant="summary">
                223,61 €
              </DescriptionListItem>
              <DescriptionListItem label="Totale" variant="summary">
                1.240,00 €
              </DescriptionListItem>
            </>
          ) : null}
        </DescriptionList>
      </div>
    </div>
  );
}

/**
 * Controls: `entity` (which kind of record is shown), badge `tone`, container width, `showSummary`,
 * `layout`; `onSelect` shows in Actions. The play function selects each of the four entities in
 * turn through the demo buttons and checks after every switch that the `<dl>` did not move and that
 * the row of an entity with no status exposes no text.
 */
export const StatusAndSummary: Story = {
  name: 'Stato e riepilogo',
  render: (args) => <StatusDemo {...(args as unknown as StatusDemoProps)} />,
  argTypes: {
    entity: { control: 'radio', options: ENTITIES },
    tone: { control: 'radio', options: TONES },
    width: { control: { type: 'range', min: 200, max: 800, step: 10 } },
    showSummary: { control: 'boolean' },
    layout: { control: 'radio', options: ['auto', 'inline', 'stacked'] satisfies DescriptionListLayout[] },
    onSelect: { control: false },
    valueKind: { table: { disable: true } },
    emptyLabel: { table: { disable: true } },
    onOpen: { table: { disable: true } },
  } as Story['argTypes'],
  args: {
    entity: 'archiviata con audit',
    tone: 'warning',
    width: 600,
    showSummary: true,
    layout: 'auto',
    onSelect: fn(),
  } as unknown as Story['args'],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByTestId('list');
    const status = canvas.getByTestId('status');
    const top = rect(list).top;
    const height = rect(status).height;
    for (const entity of [...ENTITIES, ENTITIES[0]!]) {
      await userEvent.click(canvas.getByRole('button', { name: entity }));
      await expect(Math.abs(rect(list).top - top)).toBeLessThanOrEqual(0.5);
      await expect(Math.abs(rect(status).height - height)).toBeLessThanOrEqual(0.5);
      if (entity === 'attiva, senza stato') {
        await expect(status.textContent).toBe('');
        await expect(status.childElementCount).toBe(0);
      }
    }
    await expect((args as unknown as StatusDemoProps).onSelect).toHaveBeenCalledTimes(ENTITIES.length + 1);
    // Summary value column = normal value column.
    const dds = Array.from(list.querySelectorAll('dd'));
    await expect(new Set(dds.map((d) => Math.round(rect(d).left))).size).toBe(1);
  },
};

function SummaryRows({ layout, width }: { layout: DescriptionListLayout; width: number }) {
  return (
    <div data-testid={`summary-${layout}`} style={{ width, maxWidth: 'calc(100% - 34px)', border: BORDER, padding: 16, boxSizing: 'content-box' }}>
      <DescriptionList layout={layout}>
        <DescriptionListItem label="Imponibile">1.016,39 €</DescriptionListItem>
        <DescriptionListItem label="IVA 22%" variant="summary">
          223,61 €
        </DescriptionListItem>
        <DescriptionListItem label="Totale" variant="summary">
          1.240,00 €
        </DescriptionListItem>
        <DescriptionListItem label="Pagato">0,00 €</DescriptionListItem>
        <DescriptionListItem label="Residuo" variant="summary">
          1.240,00 €
        </DescriptionListItem>
      </DescriptionList>
    </div>
  );
}

const NullBadge = () => null;

/**
 * Edge cases for the e2e suite (not photographed): a badge with an icon (the tallest variant), a
 * `status` node that renders nothing, a long badge next to a detail in a narrow box, and a summary
 * whose `className` removes the separator.
 */
export const StatusEdgeCases: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 16, width: 280 }}>
      <div data-testid="edge-plain">
        <DescriptionListStatus data-testid="row-plain" detail={AUDIT} />
      </div>
      <div data-testid="edge-icon">
        <DescriptionListStatus
          data-testid="row-icon"
          status={
            <StatusBadge tone="warning" icon={internalIcons.warning}>
              Archiviato
            </StatusBadge>
          }
          detail={AUDIT}
        />
      </div>
      <div data-testid="edge-null">
        <DescriptionListStatus data-testid="row-null" status={<NullBadge />} detail={AUDIT} />
      </div>
      <div data-testid="edge-long">
        <DescriptionListStatus
          data-testid="row-long"
          status={<StatusBadge tone="info">In attesa di approvazione del responsabile di reparto</StatusBadge>}
          detail={AUDIT}
        />
      </div>
      <DescriptionList data-testid="override-list" layout="inline">
        <DescriptionListItem label="Imponibile">1.016,39 €</DescriptionListItem>
        <DescriptionListItem label="Totale" variant="summary" className="border-0! pt-0!">
          1.240,00 €
        </DescriptionListItem>
      </DescriptionList>
    </div>
  ),
};

/** Visual: status with detail, empty status (reserved space shown as absence), truncated detail, summaries inline and stacked. */
export const StatusAndSummaryVisual: Story = {
  name: 'Stato e riepilogo (visual)',
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      {[
        { id: 'full', status: <StatusBadge tone="warning">Archiviato</StatusBadge>, detail: AUDIT, width: 420 },
        { id: 'empty', status: undefined, detail: undefined, width: 420 },
        { id: 'truncated', status: <StatusBadge tone="warning">Archiviato</StatusBadge>, detail: AUDIT, width: 250 },
      ].map(({ id, status, detail, width }) => (
        <div key={id} data-testid={`box-${id}`} style={{ width, maxWidth: 'calc(100% - 34px)', border: BORDER, padding: 16, boxSizing: 'content-box' }}>
          <DescriptionListStatus data-testid={`status-${id}`} status={status} detail={detail} />
          <div style={{ height: 12 }} />
          <DescriptionList data-testid={`list-${id}`}>
            <DescriptionListItem label="Fornitore">Acme S.r.l.</DescriptionListItem>
            <DescriptionListItem label="Numero">INV-2026-0142</DescriptionListItem>
          </DescriptionList>
        </div>
      ))}
      <SummaryRows layout="inline" width={420} />
      <SummaryRows layout="stacked" width={250} />
    </div>
  ),
};
