import { act, version } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../packages/core/src';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const frame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

describe('Dialog on React 18', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs against React 18', () => {
    expect(version.startsWith('18.')).toBe(true);
  });

  it('opens from the trigger as a named modal, names the close button after the title and returns the focus', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <Dialog>
          <DialogTrigger>Apri</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifica fornitore</DialogTitle>
              <DialogClose />
            </DialogHeader>
            <DialogDescription>Descrizione</DialogDescription>
          </DialogContent>
        </Dialog>,
      ),
    );
    const trigger = container.querySelector('button') as HTMLButtonElement;
    trigger.focus();
    act(() => trigger.click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    await act(async () => undefined);
    const close = dialog.querySelector('button') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Close:');
    expect(close.getAttribute('aria-labelledby')).toContain(dialog.getAttribute('aria-labelledby') as string);

    act(() => close.click());
    await frame();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    act(() => root.unmount());
    container.remove();
  });
});
