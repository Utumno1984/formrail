import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { ProgressBar } from './ProgressBar';

afterEach(() => vi.restoreAllMocks());

const fill = (el: HTMLElement) => el.firstElementChild as HTMLElement;

describe('ProgressBar determinate', () => {
  it('exposes role, range, value and a default percentage text', () => {
    render(<ProgressBar value={45} aria-label="Upload" />);
    const bar = screen.getByRole('progressbar', { name: 'Upload' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '45');
    expect(bar).toHaveAttribute('aria-valuetext', '45%');
  });

  it('rounds the default text and uses the real range with min/max (3 of 7 -> 43%)', () => {
    render(<ProgressBar value={3} min={0} max={7} aria-label="Files" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuetext', '43%');
  });

  it('the default text is relative to min', () => {
    render(<ProgressBar value={15} min={10} max={20} aria-label="Files" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '50%');
  });

  it('getValueLabel customises aria-valuetext and receives (value, max, min)', () => {
    const getValueLabel = vi.fn((v: number, m: number) => `${v} of ${m} files`);
    render(<ProgressBar value={3} max={7} getValueLabel={getValueLabel} aria-label="Files" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '3 of 7 files');
    expect(getValueLabel).toHaveBeenCalledWith(3, 7, 0);
  });

  it.each([
    [0, '0'],
    [50, '0.5'],
    [100, '1'],
  ])('value %i sets the fill fraction to %s, applied with scaleX', (value, fraction) => {
    render(<ProgressBar value={value} aria-label="Upload" />);
    const f = fill(screen.getByRole('progressbar'));
    expect(f.style.getPropertyValue('--rop-progress-fraction')).toBe(fraction);
    expect(f.className).toContain('[transform:scaleX(var(--rop-progress-fraction))]');
  });

  it('animates with transform (not width), only under motion-safe, with the motion tokens', () => {
    render(<ProgressBar value={10} aria-label="Upload" />);
    const cls = fill(screen.getByRole('progressbar')).className;
    expect(cls).toContain('motion-safe:[transition-property:transform]');
    expect(cls).toContain('motion-safe:duration-[var(--motion-rop-feedback-duration)]');
    expect(cls).toContain('motion-safe:ease-[var(--motion-rop-feedback-easing)]');
    expect(cls).not.toMatch(/(^|\s)transition(-all)?(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)(w-|width)/);
    expect(fill(screen.getByRole('progressbar')).style.width).toBe('');
  });

  it('uses the tone token for the fill', () => {
    const { rerender } = render(<ProgressBar value={10} aria-label="Upload" />);
    expect(fill(screen.getByRole('progressbar'))).toHaveClass('bg-rop-primary');
    rerender(<ProgressBar value={10} tone="success" aria-label="Upload" />);
    expect(fill(screen.getByRole('progressbar'))).toHaveClass('bg-rop-success');
    rerender(<ProgressBar value={10} tone="error" aria-label="Upload" />);
    expect(fill(screen.getByRole('progressbar'))).toHaveClass('bg-rop-error');
  });
});

describe('ProgressBar indeterminate', () => {
  it.each([[undefined], [null], [Number.NaN]])('value %s exposes no value attributes', (value) => {
    render(<ProgressBar value={value} aria-label="Preparing" />);
    const bar = screen.getByRole('progressbar');
    for (const a of ['aria-valuenow', 'aria-valuetext', 'aria-valuemin', 'aria-valuemax']) {
      expect(bar).not.toHaveAttribute(a);
    }
    expect(fill(bar)).toHaveAttribute('data-rop-progress-fill', 'indeterminate');
  });

  it('animates only under motion-safe, and has a static pattern that differs from a determinate fill', () => {
    render(<ProgressBar aria-label="Preparing" />);
    const cls = fill(screen.getByRole('progressbar')).className;
    expect(cls).toContain('motion-safe:animate-rop-progress-indeterminate');
    expect(cls).not.toMatch(/(^|\s)animate-/);
    expect(cls).toContain('repeating-linear-gradient');
  });

  it('switching to determinate mounts a new fill already at its value (no animation from a fake value)', () => {
    const { rerender } = render(<ProgressBar aria-label="Upload" />);
    const before = fill(screen.getByRole('progressbar'));
    rerender(<ProgressBar value={30} aria-label="Upload" />);
    const after = fill(screen.getByRole('progressbar'));
    expect(after).not.toBe(before);
    expect(after.style.getPropertyValue('--rop-progress-fraction')).toBe('0.3');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
  });

  it('a decreasing value keeps the same fill element (it transitions backwards)', () => {
    const { rerender } = render(<ProgressBar value={80} aria-label="Upload" />);
    const before = fill(screen.getByRole('progressbar'));
    rerender(<ProgressBar value={20} aria-label="Upload" />);
    expect(fill(screen.getByRole('progressbar'))).toBe(before);
    expect(before.style.getPropertyValue('--rop-progress-fraction')).toBe('0.2');
  });
});

describe('ProgressBar name', () => {
  it('accepts aria-labelledby', () => {
    render(
      <>
        <span id="t">Import</span>
        <ProgressBar value={1} aria-labelledby="t" />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: 'Import' })).toBeInTheDocument();
  });

  it('a visible label names the bar through aria-labelledby', () => {
    render(<ProgressBar value={1} label="Importing" />);
    const bar = screen.getByRole('progressbar', { name: 'Importing' });
    expect(screen.getByText('Importing').id).toBe(bar.getAttribute('aria-labelledby'));
  });

  it('console.error in development when there is no name; nothing when there is one', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ProgressBar value={1} aria-label="Ok" />);
    expect(error).not.toHaveBeenCalled();
    render(<ProgressBar value={1} />);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('accessible name');
  });
});

describe('ProgressBar no announcements', () => {
  it('has no live region or status role, also after a value change', () => {
    const { container, rerender } = render(<ProgressBar value={10} aria-label="Upload" label="Upload" />);
    rerender(<ProgressBar value={90} aria-label="Upload" label="Upload" />);
    expect(container.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]')).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('ProgressBar out-of-range and invalid input', () => {
  it('clamps a value above max and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ProgressBar value={150} aria-label="Upload" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '100%');
    expect(fill(bar).style.getPropertyValue('--rop-progress-fraction')).toBe('1');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('clamps a value below min and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ProgressBar value={-5} aria-label="Upload" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn for the boundary values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ProgressBar value={0} aria-label="a" />);
    render(<ProgressBar value={100} aria-label="b" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('NaN is indeterminate without warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ProgressBar value={Number.NaN} aria-label="Upload" />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    [5, 5],
    [10, 5],
    [0, Number.NaN],
  ])('max <= min (min=%i, max=%i): console.error, no crash, indeterminate', (min, max) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ProgressBar value={3} min={min} max={max} aria-label="Upload" />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('max > min');
  });
});

describe('ProgressBar props and DOM', () => {
  it('does not leak non-DOM props (tone, getValueLabel, value, min, max, label)', () => {
    const { container } = render(
      <ProgressBar value={5} min={0} max={10} tone="error" getValueLabel={() => 'x'} label="L" />,
    );
    const html = container.innerHTML;
    for (const leaked of ['tone', 'getvaluelabel', 'getValueLabel', ' value=', ' min=', ' max=']) {
      expect(html).not.toContain(leaked);
    }
  });

  it('className wins over the defaults (real merge), ref is forwarded, attributes pass through', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ProgressBar ref={ref} value={5} aria-label="Upload" className="h-4 rounded-none" data-testid="x" id="p" />);
    const bar = screen.getByTestId('x');
    expect(ref.current).toBe(bar);
    expect(bar).toHaveAttribute('id', 'p');
    expect(bar).toHaveClass('h-4', 'rounded-none');
    expect(bar).not.toHaveClass('h-2');
    expect(bar).not.toHaveClass('rounded-full');
  });

  it('with a label, className/ref/attributes go to the progressbar, not the wrapper', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ProgressBar ref={ref} value={5} label="L" className="w-40" data-testid="x" />);
    const bar = screen.getByRole('progressbar');
    expect(ref.current).toBe(bar);
    expect(bar).toHaveAttribute('data-testid', 'x');
    expect(bar).toHaveClass('w-40');
    expect(bar).not.toHaveClass('w-full');
  });

  it('uses logical properties and token classes only', () => {
    render(<ProgressBar aria-label="Upload" />);
    const bar = screen.getByRole('progressbar');
    const cls = bar.className + ' ' + fill(bar).className;
    expect(cls).toContain('start-0');
    expect(cls).not.toMatch(/(^|\s)(left|right|ml|mr|pl|pr)-/);
    expect(cls).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl|\[#/i);
  });

  it('keeps the same track height classes in every state', () => {
    const heights = [undefined, 0, 100, 40].map((value) => {
      const { unmount } = render(<ProgressBar value={value} aria-label="Upload" />);
      const cls = screen.getByRole('progressbar').className;
      unmount();
      return cls;
    });
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toContain('h-2');
  });

  it('keeps the fill visible in forced-colors mode', () => {
    render(<ProgressBar value={10} aria-label="Upload" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.className).toContain('forced-colors:[outline-style:solid]');
    expect(fill(bar).className).toContain('forced-colors:bg-[Highlight]');
  });
});
