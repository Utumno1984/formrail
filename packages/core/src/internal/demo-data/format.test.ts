// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { formatDate, formatMoney } from './format';

const DIR = dirname(fileURLToPath(import.meta.url));

describe('formatMoney', () => {
  it('formats minor units in en-US with the currency symbol', () => {
    expect(formatMoney(123456, 'EUR')).toBe('€1,234.56');
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    expect(formatMoney(123456, 'GBP')).toBe('£1,234.56');
    expect(formatMoney(5, 'EUR')).toBe('€0.05');
  });

  it('prints yen without decimals (no minor unit)', () => {
    expect(formatMoney(123456, 'JPY')).toBe('¥123,456');
    expect(formatMoney(1, 'JPY')).toBe('¥1');
  });

  it('formats zero and negative amounts', () => {
    expect(formatMoney(0, 'EUR')).toBe('€0.00');
    expect(formatMoney(0, 'JPY')).toBe('¥0');
    expect(formatMoney(-0, 'GBP')).toBe('£0.00');
    expect(formatMoney(-1250, 'EUR')).toBe('-€12.50');
    expect(formatMoney(-1250, 'JPY')).toBe('-¥1,250');
  });

  it('refuses floats and unsafe integers (money is never a float here)', () => {
    expect(() => formatMoney(12.5, 'EUR')).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN, 'EUR')).toThrow(RangeError);
    expect(() => formatMoney(2 ** 53, 'EUR')).toThrow(RangeError);
    // @ts-expect-error an unsupported currency fails loudly
    expect(() => formatMoney(100, 'CHF')).toThrow(RangeError);
  });

  it('always passes the en-US locale explicitly to Intl.NumberFormat', async () => {
    vi.resetModules();
    const spy = vi.spyOn(Intl, 'NumberFormat');
    try {
      const fresh = await import('./format');
      fresh.formatMoney(100, 'USD');
      fresh.formatMoney(100, 'JPY');
      expect(spy).toHaveBeenCalled();
      for (const call of spy.mock.calls) expect(call[0]).toBe('en-US');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('formatDate', () => {
  it('prints the en-US medium date, with no time-zone shift on DST days', () => {
    expect(formatDate('2026-03-29')).toBe('Mar 29, 2026');
    expect(formatDate('2026-10-25')).toBe('Oct 25, 2026');
    expect(formatDate('2024-02-29')).toBe('Feb 29, 2024');
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('matches Intl en-US (UTC) for every day of 2026', () => {
    const intl = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
    for (let day = 0; day < 365; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day));
      expect(formatDate(date.toISOString().slice(0, 10))).toBe(intl.format(date));
    }
  });

  it('rejects anything that is not an existing ISO date', () => {
    expect(() => formatDate('2026-02-30')).toThrow(RangeError);
    expect(() => formatDate('2026-03-29T00:00:00Z')).toThrow(RangeError);
  });
});

describe('formatters in another runtime locale and time zone', () => {
  it('print the same text under LANG=de_DE / ja_JP and far-away time zones', async () => {
    const out = mkdtempSync(join(tmpdir(), 'demo-format-'));
    try {
      const script = join(out, 'probe.mjs');
      await build({
        stdin: {
          contents: `
            import { formatMoney, formatDate } from './format';
            console.log(JSON.stringify({
              runtimeLocale: new Intl.NumberFormat().resolvedOptions().locale,
              runtimeOffset: new Date(Date.UTC(2026, 2, 29)).getTimezoneOffset(),
              money: [formatMoney(123456, 'EUR'), formatMoney(-1250, 'GBP'), formatMoney(123456, 'JPY'), formatMoney(0, 'USD')],
              date: [formatDate('2026-03-29'), formatDate('2026-10-25'), formatDate('2024-02-29')],
            }));
          `,
          resolveDir: DIR,
          loader: 'ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: script,
        logLevel: 'silent',
      });
      const run = (env: Record<string, string>) => {
        const result = spawnSync(process.execPath, [script], { env: { ...process.env, ...env }, encoding: 'utf8' });
        expect(result.status, result.stderr).toBe(0);
        return JSON.parse(result.stdout) as { runtimeLocale: string; runtimeOffset: number; money: string[]; date: string[] };
      };
      const expected = {
        money: ['€1,234.56', '-£12.50', '¥123,456', '$0.00'],
        date: ['Mar 29, 2026', 'Oct 25, 2026', 'Feb 29, 2024'],
      };
      const german = run({ LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8', TZ: 'Pacific/Kiritimati' });
      const japanese = run({ LANG: 'ja_JP.UTF-8', LC_ALL: 'ja_JP.UTF-8', TZ: 'America/Los_Angeles' });
      // The probes really ran in another locale and zone (otherwise this test would prove nothing).
      expect(german.runtimeLocale).toMatch(/^de/);
      expect(japanese.runtimeLocale).toMatch(/^ja/);
      expect(german.runtimeOffset).toBe(-840);
      expect(japanese.runtimeOffset).toBe(420);
      expect({ money: german.money, date: german.date }).toEqual(expected);
      expect({ money: japanese.money, date: japanese.date }).toEqual(expected);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
