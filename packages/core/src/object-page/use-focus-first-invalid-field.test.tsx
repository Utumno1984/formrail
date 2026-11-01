import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withoutPaths } from './field-errors';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';

const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  scrollIntoView.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function Form({ errors, fields = ['a', 'b', 'c'] }: { errors: Partial<Record<string, string>>; fields?: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef: ref, fieldErrors: errors });
  return (
    <div ref={ref}>
      {fields.map((n) => (
        <input key={n} name={n} aria-label={n} />
      ))}
    </div>
  );
}

describe('useFocusFirstInvalidField', () => {
  it('does nothing while fieldErrors is empty', () => {
    render(<Form errors={{}} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });

  it('focuses and centers the first invalid field in DOM order, not in key order', () => {
    const { getByLabelText } = render(<Form errors={{ c: 'x', b: 'y' }} />);
    expect(getByLabelText('b')).toHaveFocus();
    expect(getByLabelText('a')).not.toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(scrollIntoView.mock.contexts[0]).toBe(getByLabelText('b'));
  });

  it('fires on every new non-empty fieldErrors object, even with identical content', () => {
    const { rerender, getByLabelText } = render(<Form errors={{}} />);
    rerender(<Form errors={{ b: 'x' }} />);
    expect(getByLabelText('b')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // second failed attempt, same content, new object: the user moved away meanwhile
    getByLabelText('c').focus();
    rerender(<Form errors={{ b: 'x' }} />);
    expect(getByLabelText('b')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    // different content, new object
    rerender(<Form errors={{ c: 'y' }} />);
    expect(getByLabelText('c')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
  });

  it('does not fire again for the same fieldErrors object, nor when it becomes empty', () => {
    const errors = { b: 'x' };
    const { rerender, getByLabelText } = render(<Form errors={errors} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    getByLabelText('c').focus();
    rerender(<Form errors={errors} />);
    expect(getByLabelText('c')).toHaveFocus();
    rerender(<Form errors={{}} />);
    expect(getByLabelText('c')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('ignores the object of a partial clearing (withoutPaths), then fires again for a new attempt', () => {
    const attempt = { a: 'x', b: 'y', c: 'z' };
    const { rerender, getByLabelText } = render(<Form errors={attempt} />);
    expect(getByLabelText('a')).toHaveFocus();
    // the user types in c: a and b are still invalid, but the focus must stay in c
    getByLabelText('c').focus();
    rerender(<Form errors={withoutPaths(attempt, ['c'])} />);
    expect(getByLabelText('c')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // a new failed attempt (plain object, same content as what is left) moves it again
    rerender(<Form errors={{ a: 'x', b: 'y' }} />);
    expect(getByLabelText('a')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('with trigger, only a change of trigger fires: a new fieldErrors object alone does not', () => {
    function Triggered({ errors, trigger }: { errors: Partial<Record<string, string>>; trigger: unknown }) {
      const ref = useRef<HTMLDivElement>(null);
      useFocusFirstInvalidField({ containerRef: ref, fieldErrors: errors, trigger });
      return (
        <div ref={ref}>
          {['a', 'b', 'c'].map((n) => (
            <input key={n} name={n} aria-label={n} />
          ))}
        </div>
      );
    }
    const { rerender, getByLabelText } = render(<Triggered errors={{}} trigger={0} />);
    rerender(<Triggered errors={{ b: 'x' }} trigger={1} />);
    expect(getByLabelText('b')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    getByLabelText('c').focus();
    // new objects (derived copies, edits), same trigger: nothing
    rerender(<Triggered errors={{ b: 'x' }} trigger={1} />);
    rerender(<Triggered errors={{ a: 'y', b: 'x' }} trigger={1} />);
    expect(getByLabelText('c')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // new trigger, identical content: fires, reading the errors of that render
    rerender(<Triggered errors={{ a: 'y', b: 'x' }} trigger={2} />);
    expect(getByLabelText('a')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    // with trigger, even a clearing object is focused when the trigger changes
    getByLabelText('c').focus();
    rerender(<Triggered errors={withoutPaths({ a: 'y', b: 'x' }, ['a'])} trigger={3} />);
    expect(getByLabelText('b')).toHaveFocus();
  });

  it('trigger undefined keeps the identity behavior', () => {
    const { rerender, getByLabelText } = render(<Form errors={{ b: 'x' }} />);
    getByLabelText('c').focus();
    rerender(<Form errors={{ b: 'x' }} />);
    expect(getByLabelText('b')).toHaveFocus();
  });

  it('works inside an open ShadowRoot, where document.activeElement is the host', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const mount = document.createElement('div');
    host.attachShadow({ mode: 'open' }).append(mount);
    const { unmount } = render(<Form errors={{ b: 'x', c: 'y' }} />, { container: mount });
    const root = host.shadowRoot!;
    const b = root.querySelector<HTMLInputElement>('[name="b"]')!;
    expect(root.activeElement).toBe(b);
    expect(document.activeElement).toBe(host);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(b);
    unmount();
    host.remove();
  });

  it('only looks inside the container', () => {
    const outside = document.createElement('input');
    outside.name = 'a';
    document.body.prepend(outside);
    const { getByLabelText } = render(<Form errors={{ a: 'x' }} />);
    expect(getByLabelText('a')).toHaveFocus();
    outside.remove();
  });

  it('console.errors once in development and does not throw when no key matches a [name]', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Form errors={{ missing: 'x', other: 'y' }} />);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('useFocusFirstInvalidField'));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });

  it('stays silent in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Form errors={{ missing: 'x' }} />);
    expect(error).not.toHaveBeenCalled();
  });

  it('skips a disabled or hidden first match and focuses the next one in DOM order', () => {
    function Mixed() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusFirstInvalidField({ containerRef: ref, fieldErrors: { a: 'x', b: 'y', c: 'z' } });
      return (
        <div ref={ref}>
          <input name="a" type="hidden" />
          <input name="b" disabled aria-label="b" />
          <input name="c" aria-label="c" />
        </div>
      );
    }
    const { getByLabelText } = render(<Mixed />);
    expect(getByLabelText('c')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('console.errors when every match is unfocusable', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    function OnlyDisabled() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusFirstInvalidField({ containerRef: ref, fieldErrors: { a: 'x' } });
      return (
        <div ref={ref}>
          <input name="a" disabled />
        </div>
      );
    }
    render(<OnlyDisabled />);
    expect(error).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('treats a key whose value is undefined as no error', () => {
    const { rerender, getByLabelText } = render(<Form errors={{ a: undefined }} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(<Form errors={{ a: undefined, c: 'x' }} />);
    expect(getByLabelText('c')).toHaveFocus();
  });

  it('handles field names that would need CSS escaping', () => {
    const odd = 'a"]b';
    const { getByLabelText } = render(<Form errors={{ [odd]: 'x' }} fields={['q', odd]} />);
    expect(getByLabelText(odd)).toHaveFocus();
  });
});
