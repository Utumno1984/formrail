import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { ObjectPage } from './ObjectPage';
import { ObjectPageFooter } from './ObjectPageFooter';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';
import { useObjectPageForm } from './use-object-page-form';

interface PlaygroundArgs {
  visible: boolean;
  message: string;
  messageTone: 'error' | 'success' | 'info';
  label: string;
  onSave: () => void;
  onCancel: () => void;
}

const LONG_MESSAGE =
  'Salvataggio non riuscito: il server ha rifiutato la modifica perché la fattura è stata aggiornata da un altro utente nel frattempo. Ricarica la pagina e riprova.';

const meta: Meta<PlaygroundArgs> = {
  title: 'Floorplans/Object Page/Footer',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    visible: { control: 'boolean', description: 'Visibile e interattivo; nascosto occupa comunque lo stesso spazio ed è inert' },
    message: { control: 'text', description: 'Messaggio di stato su una riga (troncato; testo completo su hover/focus)' },
    messageTone: { control: 'radio', options: ['error', 'success', 'info'], description: 'Icona e colore del messaggio' },
    label: { control: 'text', description: 'Nome accessibile della region' },
    onSave: { control: false },
    onCancel: { control: false },
  },
  args: {
    visible: true,
    message: LONG_MESSAGE,
    messageTone: 'error',
    label: 'Azioni di salvataggio',
    onSave: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

// Inline styles: the stories are not scanned by Tailwind, so a class only used here would not exist.
const FRAME: CSSProperties = { height: '100dvh', boxSizing: 'border-box', background: 'var(--color-rop-surface, #fff)' };
// A toolbar row above the page, then the page filling the rest of the frame.
const TOOLBAR_FRAME: CSSProperties = { ...FRAME, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' };
const TOOLBAR: CSSProperties = { display: 'flex', justifyContent: 'flex-end', padding: 8 };
const BLOCK_BG = 'var(--color-rop-blue-50, #eef5fc)';

function Filler({ height, children }: { height: number; children: ReactNode }) {
  return <div style={{ height, background: BLOCK_BG, borderRadius: 8, padding: 12, boxSizing: 'border-box' }}>{children}</div>;
}

function LongContent() {
  return (
    <>
      <ObjectPageSection id="dati" title="Dati generali">
        <Filler height={520}>Contenuto di Dati generali</Filler>
      </ObjectPageSection>
      <ObjectPageSection id="importi" title="Importi">
        <Filler height={520}>Contenuto di Importi</Filler>
      </ObjectPageSection>
      <ObjectPageSection id="note" title="Note">
        <Filler height={200}>Contenuto di Note</Filler>
        <div style={{ marginTop: 12 }}>
          <Field label="Note interne" help="Visibili solo al team.">
            <Input />
          </Field>
        </div>
      </ObjectPageSection>
    </>
  );
}

const scrollerOf = (root: HTMLElement) => root.querySelector('[data-object-page-scroller]') as HTMLElement;

/**
 * The footer is a presentational bar: here it is driven by the `visible` control, and by two buttons
 * that behave like a real save (Salva and Annulla modifiche both hide it, as a clean form would).
 * "Modifica" (in a toolbar above the page, so reachable at any scroll position) shows it again,
 * standing in for the first edit of a field.
 */
export const Playground: Story = {
  render: function Render(args) {
    const { message, messageTone, label, onSave, onCancel } = args;
    // Local state, set again whenever the `visible` control changes (updating the args from here would
    // replace the `fn()` spies, which the Actions panel and the play function watch).
    const [visible, setVisible] = useState(args.visible);
    const [seen, setSeen] = useState(args.visible);
    if (seen !== args.visible) {
      setSeen(args.visible);
      setVisible(args.visible);
    }
    return (
      <div style={TOOLBAR_FRAME}>
        <div style={TOOLBAR}>
          <Button variant="secondary" onClick={() => setVisible(true)}>
            Modifica
          </Button>
        </div>
        <ObjectPage>
          <ObjectPageHeader title="Fattura 2026/0142" subtitle="ACME srl" />
          <ObjectPageFooter visible={visible} message={message} messageTone={messageTone} label={label}>
            <Button
              onClick={() => {
                onSave();
                setVisible(false);
              }}
            >
              Salva
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                onCancel();
                setVisible(false);
              }}
            >
              Annulla modifiche
            </Button>
          </ObjectPageFooter>
          <LongContent />
        </ObjectPage>
      </div>
    );
  },
  args: { visible: false },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const scroller = scrollerOf(canvasElement);
    scroller.scrollTop = 300;
    const before = { top: scroller.scrollTop, height: scroller.clientHeight };

    await userEvent.click(canvas.getByRole('button', { name: 'Modifica' }));
    const region = await canvas.findByRole('region', { name: args.label });
    await expect(region).toBeVisible();
    await expect(scroller.scrollTop).toBe(before.top);
    await expect(scroller.clientHeight).toBe(before.height);

    // Salva: the demo hides the footer as a successful save would, with the focus still on the button.
    await userEvent.click(within(region).getByRole('button', { name: 'Salva' }));
    await expect(args.onSave).toHaveBeenCalled();
    await waitFor(() => expect(canvas.queryByRole('region', { name: args.label })).not.toBeInTheDocument());
    await expect(canvas.getByRole('heading', { level: 1, name: 'Fattura 2026/0142' })).toHaveFocus();
    await expect(scroller.scrollTop).toBe(before.top);
    await expect(scroller.clientHeight).toBe(before.height);
  },
};

/** The Playground without a `play` function: what `e2e/object-page-footer.spec.ts` drives with real input. */
export const Manual: Story = {
  render: Playground.render,
  args: { visible: false },
};

/** Footer hidden: its room stays, an empty band at the bottom. */
export const Hidden: Story = {
  tags: ['visual'],
  args: { visible: false },
  render: (args) => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Fattura 2026/0142" subtitle="ACME srl" />
        <ObjectPageFooter visible={args.visible} label={args.label}>
          <Button>Salva</Button>
          <Button variant="secondary">Annulla modifiche</Button>
        </ObjectPageFooter>
        <LongContent />
      </ObjectPage>
    </div>
  ),
};

/** Footer visible with its actions and no message. */
export const WithActions: Story = {
  tags: ['visual'],
  args: { visible: true },
  render: (args) => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Fattura 2026/0142" subtitle="ACME srl" />
        <ObjectPageFooter visible={args.visible} label={args.label}>
          <Button>Salva</Button>
          <Button variant="secondary">Annulla modifiche</Button>
        </ObjectPageFooter>
        <LongContent />
      </ObjectPage>
    </div>
  ),
};

/** A long save error: one line, truncated, the footer keeps its height. */
export const LongError: Story = {
  tags: ['visual'],
  args: { visible: true },
  render: (args) => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Fattura 2026/0142" subtitle="ACME srl" />
        <ObjectPageFooter visible={args.visible} message={args.message} messageTone="error" label={args.label}>
          <Button>Salva</Button>
          <Button variant="secondary">Annulla modifiche</Button>
        </ObjectPageFooter>
        <LongContent />
      </ObjectPage>
    </div>
  ),
};

/**
 * Wired to `useObjectPageForm`: the footer shows only while the form is dirty and its message is the
 * general `saveError`. Per-field validation is the demo's own state (`fieldErrors`), shown on the Field
 * and never in the footer; on a failed validation the demo moves the focus to the first invalid field
 * through `useFocusFirstInvalidField`, which finds it by the `name` of its Field.
 * Type "fail" in the supplier to get a save error.
 */
export const FormFlow: Story = {
  args: { visible: true },
  render: function Render() {
    const form = useObjectPageForm({ baseline: { supplier: 'ACME srl', note: '' } });
    const [fieldErrors, setFieldErrors] = useState<{ supplier?: string }>({});
    const frameRef = useRef<HTMLDivElement>(null);
    // The first invalid control is found through the `name` of its Field.
    useFocusFirstInvalidField({ containerRef: frameRef, fieldErrors });

    const submit = async () => {
      const errors: { supplier?: string } = form.values.supplier.trim() === '' ? { supplier: 'Il fornitore è obbligatorio.' } : {};
      setFieldErrors(errors);
      if (errors.supplier) return;
      await form.save(async (values) => {
        if (values.supplier === 'fail') throw new Error('Il server ha rifiutato il salvataggio.');
      });
    };

    return (
      <div ref={frameRef} style={FRAME}>
        <ObjectPage>
          <ObjectPageHeader title="Fattura 2026/0142" />
          <ObjectPageFooter
            visible={form.isDirty}
            message={form.saveError ? (form.saveError instanceof Error ? form.saveError.message : String(form.saveError)) : undefined}
            messageTone="error"
          >
            <Button onClick={submit} aria-disabled={form.isSaving || undefined}>
              Salva
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setFieldErrors({});
                form.reset();
              }}
            >
              Annulla modifiche
            </Button>
          </ObjectPageFooter>
          <ObjectPageSection id="dati" title="Dati generali">
            <Field label="Fornitore" name="supplier" required error={fieldErrors.supplier}>
              <Input value={form.values.supplier} onChange={(e) => form.setValue('supplier', e.target.value)} />
            </Field>
            <Field label="Note">
              <Input value={form.values.note} onChange={(e) => form.setValue('note', e.target.value)} />
            </Field>
          </ObjectPageSection>
        </ObjectPage>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const supplier = canvas.getByRole('textbox', { name: 'Fornitore' });
    await expect(canvas.queryByRole('region', { name: 'Azioni di salvataggio' })).not.toBeInTheDocument();
    await userEvent.clear(supplier);
    await userEvent.click(await canvas.findByRole('button', { name: 'Salva' }));
    // The validation error is on the field, not in the footer; the focus went back to the field.
    await expect(await canvas.findByText('Il fornitore è obbligatorio.')).toBeInTheDocument();
    await expect(supplier).toHaveFocus();
    await expect(within(canvas.getByRole('region', { name: 'Azioni di salvataggio' })).queryByText(/obbligatorio/)).not.toBeInTheDocument();
  },
};
