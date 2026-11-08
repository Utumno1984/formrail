import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { NumberInput } from './NumberInput';

describe('NumberInput: SSR', () => {
  it('renderToString + hydrateRoot with an explicit locale: localized text, no hydration error, no callback', async () => {
    const onValueChange = vi.fn();
    const element = (
      <form>
        <Field label="Unit price" name="price">
          <NumberInput locale="it-IT" defaultValue={12.37} min={0} step={0.01} onValueChange={onValueChange} />
        </Field>
      </form>
    );
    const html = renderToString(element);
    expect(html).toContain('role="spinbutton"');
    expect(html).toContain('value="12,37"');
    expect(html).toContain('aria-valuetext="12,37"');
    expect(html).toMatch(/type="hidden" name="price" value="12.37"/);
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { hydrateRoot } = await import('react-dom/client');
    let root: ReturnType<typeof hydrateRoot> | undefined;
    act(() => {
      root = hydrateRoot(host, element, { onRecoverableError: (e) => console.error(e) });
    });
    expect(error).not.toHaveBeenCalled();
    expect(host.querySelector('[role="spinbutton"]')).toHaveValue('12,37');
    expect(onValueChange).not.toHaveBeenCalled();
    act(() => root?.unmount());
    host.remove();
    error.mockRestore();
  });
});
