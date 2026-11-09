import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Textarea } from './Textarea';

it('hydrates the server markup (rows as fallback) without a mismatch warning', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const ui = <Textarea autoResize maxRows={4} aria-label="Reason" defaultValue={'a\nb\nc\nd\ne'} />;
  const container = document.createElement('div');
  container.innerHTML = renderToString(ui);
  document.body.append(container);
  expect(container.querySelector('textarea')).toHaveAttribute('rows', '3');
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, ui);
  });
  expect(error).not.toHaveBeenCalled();
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
