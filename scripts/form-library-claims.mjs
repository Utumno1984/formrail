// The "works with" claim about the two form libraries (ticket #563): one sentence, in the Pro README and on the
// /teams/ landing, derived from the peer ranges in packages/pro/package.json (read, never written). The peer of
// `@tanstack/react-form` is a tilde range (`~1.33.5`) because the adapter reads non-public internals: the claim is
// "tested on 1.33.x", never "1.x". If the peer is widened, the claim must be rewritten by a person, so this fails.

const RHF = 'react-hook-form';
const TANSTACK = '@tanstack/react-form';

/** The sentence both documents must contain (plain text), from the package.json of `@formrail/pro`. */
export function expectedClaim(pkg) {
  const peers = pkg.peerDependencies ?? {};
  const rhf = peers[RHF];
  const tanstack = peers[TANSTACK];
  if (typeof rhf !== 'string') throw new Error(`peer ${RHF} is missing in packages/pro/package.json`);
  const match = /^~(\d+)\.(\d+)\.\d+$/.exec(tanstack ?? '');
  if (!match) {
    throw new Error(
      `peer ${TANSTACK} is "${tanstack}": expected a tilde range such as ~1.33.5. If it was widened on purpose, ` +
        'rewrite the claim (README of Pro and /teams/ landing) and this derivation together.',
    );
  }
  const tested = `${match[1]}.${match[2]}.x`;
  return `Works with React Hook Form (${RHF} ${rhf}) and TanStack Form (${TANSTACK}, tested on ${tested}).`;
}

/** Visible text of an HTML or Markdown source: tags, backticks and bold markers dropped, whitespace collapsed. */
export function plainText(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ');
}

/** Every "tested on X" a document states, to be compared with the derived version. */
export function testedOnVersions(text) {
  return [...text.matchAll(/tested on (\d[\w.]*\w)/gi)].map((m) => m[1]);
}

/** A promise of compatibility with any 1.x of TanStack Form ("1.x", "all 1.x versions", "^1"). */
export function promisesAnyMajor1(text) {
  return /(?<![\d.])1\.x\b|(?<![\w.])\^1(?:\.0)?(?:\.0)?(?![\d.])/.test(text);
}
