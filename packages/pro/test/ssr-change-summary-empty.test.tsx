// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { ChangeSummary } from '../src/index';

describe('ChangeSummary empty state on the server', () => {
  it('renders without a DOM, with the group name, the text and a hidden icon', () => {
    expect(typeof window).toBe('undefined');
    const html = renderToString(<ChangeSummary entries={[]} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Changes"');
    expect(html).toContain('No changes');
    expect(html).toContain('aria-hidden="true"');
  });
});
