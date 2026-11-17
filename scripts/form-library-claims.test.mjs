import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { expectedClaim, plainText, promisesAnyMajor1, testedOnVersions } from './form-library-claims.mjs';

// Ticket #563: the landing /teams/ and the Pro README state the supported form libraries with the verified version,
// the same sentence, and it equals the peer range in packages/pro/package.json (read here, never written).

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
const pkg = JSON.parse(read('packages/pro/package.json'));
const landing = plainText(read('site-root/teams.html'));
const readme = plainText(read('packages/pro/README.md'));
const claim = expectedClaim(pkg);

describe('claim derived from the peer of packages/pro/package.json', () => {
  it('is "tested on 1.33.x" for the current peer ~1.33.5', () => {
    expect(pkg.peerDependencies['@tanstack/react-form']).toBe('~1.33.5');
    expect(claim).toContain('TanStack Form (@tanstack/react-form, tested on 1.33.x)');
    expect(claim).toContain('React Hook Form (react-hook-form ^7.92.0)');
  });

  it('follows the peer: a new tested minor changes the expected sentence', () => {
    const next = expectedClaim({ peerDependencies: { ...pkg.peerDependencies, '@tanstack/react-form': '~1.34.0' } });
    expect(next).toContain('tested on 1.34.x');
    expect(next).not.toBe(claim);
  });

  it.each(['^1.33.5', '>=1.33.5', '1.33.5', '*', undefined])('refuses a peer that is not a tilde range (%s)', (range) => {
    const peers = { ...pkg.peerDependencies, '@tanstack/react-form': range };
    expect(() => expectedClaim({ peerDependencies: peers })).toThrow(/tilde range/);
  });
});

describe.each([
  ['the /teams/ landing (site-root/teams.html)', landing],
  ['the Pro README (packages/pro/README.md)', readme],
])('%s', (_name, text) => {
  it('states the claim, with the version of the peer', () => {
    expect(text).toContain(claim);
  });

  it('cites no other "tested on" version than the peer minor', () => {
    const versions = testedOnVersions(text);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set(['1.33.x']));
  });

  it('never promises compatibility with every 1.x', () => {
    expect(promisesAnyMajor1(text)).toBe(false);
  });
});

describe('the guards themselves', () => {
  it('fail when a document cites another version than the peer', () => {
    const stale = landing.replace('tested on 1.33.x', 'tested on 1.32.x');
    expect(stale).not.toContain(claim);
    expect(testedOnVersions(stale)).toContain('1.32.x');
  });

  it('fail when the two documents word the claim differently', () => {
    const reworded = landing.replace('Works with', 'Compatible with');
    expect(reworded).not.toContain(claim);
  });

  it.each([
    'works with every 1.x',
    'compatible with @tanstack/react-form ^1',
    'any 1.x release',
    'any @tanstack/react-form ^1.33.5 release works',
    '@tanstack/react-form >=1.33.5',
    'works with 1.33+',
    'versions 1.33 and later',
    'versions 1.33.5 or newer',
    'Any `@tanstack/react-form` ^1.33.5 release works, as do versions 1.33 and later.',
    // Ticket #573: the open-ended forms with a ".x" or other wordings.
    '1.33.x and later',
    '1.33.x or later',
    '1.33.x and above',
    '1.33.x or newer',
    '1.33.x+',
    '1.33.5+',
    'versions 1.33.x onwards',
    '1.33.5 onwards',
    'at least 1.33.5',
    'At least v1.33',
    '≥1.33.5',
    '≥ 1.33.5',
    'Works with TanStack Form 1.33.x and later (React 18 and later).',
  ])(
    'spot the promise "%s"',
    (text) => {
      expect(promisesAnyMajor1(text)).toBe(true);
    },
  );

  it.each(['tested on 1.33.x', 'versions 1.33.5', 'react-hook-form ^7.92.0', '~1.33.5', 'release 11.x', 'Map {"k" => 1}', 'tested on 1.33.x and 1.34 later this year',
    // Other libraries' requirements are not a promise about the form libraries (ticket #573).
    'React 18 and later',
    'React 18.2 and later',
    'Node 20 or newer',
    'Node 21 or newer',
    'requires React 19 or above',
    'TypeScript 5.4 and later',
    'Vitest 2.1 onwards',
    'Node 20+',
    'at least 18 characters',
    'at least 1 release',
    '≥18',
  ])('let "%s" through', (text) => {
    expect(promisesAnyMajor1(text)).toBe(false);
  });
});

describe('the helpers, one mutation each', () => {
  it('testedOnVersions is case-insensitive ("Tested on 1.32.x")', () => {
    expect(testedOnVersions('Tested on 1.32.x')).toEqual(['1.32.x']);
  });

  it('plainText drops an HTML comment, even one containing ">"', () => {
    const text = plainText('<p>Hello</p><!-- a > tested on 1.32.x -->');
    expect(text).not.toContain('1.32.x');
    expect(testedOnVersions(text)).toEqual([]);
  });

  it('expectedClaim fails loudly when the react-hook-form peer is missing', () => {
    expect(() => expectedClaim({ peerDependencies: { '@tanstack/react-form': '~1.33.5' } })).toThrow(/react-hook-form is missing/);
  });
});
