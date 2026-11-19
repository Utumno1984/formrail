// @vitest-environment node
// #524: the story-only customers' add-ons (`src/showcase/`) never reach the published Pro bundles, as the sales
// orders' ones (test/dist.smoke.test.ts, #522). Each probe is first found in the showcase sources, so the check cannot
// pass on a typo. Runs on the build `npm run check` makes before the tests.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('the published Pro bundles (#524)', () => {
  it('contain no text of the customers\' add-ons', () => {
    const showcaseDir = fileURLToPath(new URL('./', import.meta.url));
    const sources = ['customer-review.tsx', 'customer-rebase.tsx', 'record-integrity.tsx'].map((name) => readFileSync(join(showcaseDir, name), 'utf8')).join('\n');
    const probes = [
      'This customer was updated while you were editing.',
      'This customer was archived on the server',
      'Your unsaved changes',
      'Could not save the customer: it was archived on the server.',
      'Only the order of the contacts changed.',
      'You are overwriting a server change',
    ];
    const distDir = fileURLToPath(new URL('../../dist/', import.meta.url));
    const bundles = readdirSync(distDir).filter((name) => /\.(c?js|d\.c?ts)$/.test(name));
    expect(bundles.length).toBeGreaterThan(0);
    for (const probe of probes) {
      expect(sources, probe).toContain(probe);
      for (const name of bundles) expect(readFileSync(join(distDir, name), 'utf8'), `${name}: ${probe}`).not.toContain(probe);
    }
  });
});
