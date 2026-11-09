// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Textarea } from './Textarea';

it('renders on the server with `rows` as the height, no warning, no non-DOM props in the markup', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const html = renderToString(
    <Field label="Rejection reason">
      <Textarea autoResize maxRows={4} rows={2} defaultValue={'a\nb\nc\nd'} />
    </Field>,
  );
  expect(html).toContain('<textarea');
  expect(html).toContain('rows="2"');
  expect(html).not.toMatch(/autoresize|maxrows/i);
  expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
