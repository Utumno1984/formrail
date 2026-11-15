// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_COMPANY } from '../src/internal/demo-data/company';
import { getSupportCase, makeInvoices, makePurchaseOrders, makeSalesOrders, makeSupportCases, SUPPORT_CASE_STATUS_LABEL } from '../src/internal/demo-data/index';
import { collectDeclaredPaths, findMissingPaths } from './helpers/package-paths';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(packageDir, 'dist');
const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
  [key: string]: unknown;
};

describe('package.json contract (requires a prior `npm run build`)', () => {
  it('every path in main/module/types/exports exists in dist', () => {
    const declared = collectDeclaredPaths(pkg);
    expect(declared.length).toBeGreaterThan(0);
    expect(findMissingPaths(pkg, packageDir)).toEqual([]);
  });

  it('the CSS entries resolve through the exports map, like a consumer would', () => {
    const require = createRequire(import.meta.url);
    for (const entry of ['styles.css', 'theme.css']) {
      const resolved = require.resolve(`@formrail/core/${entry}`);
      expect(existsSync(resolved)).toBe(true);
      expect(resolved).toBe(join(distDir, entry));
    }
    // Subpaths that are not exported stay private.
    expect(() => require.resolve('@formrail/core/src/styles/tokens.css')).toThrow();
  });

  it('dist has an ESM entry, a CJS entry and type declarations', () => {
    const files = readdirSync(distDir);
    expect(files).toContain('index.js');
    expect(files).toContain('index.cjs');
    expect(files).toContain('index.d.ts');
    expect(files).toContain('index.d.cts');
  });

  it('no published file carries an absolute path of the build machine (source maps included)', () => {
    // Beyond the exact path of this checkout (`packageDir`), also flag any string that merely
    // *looks like* an absolute filesystem path (Unix root or Windows drive letter) followed by a
    // path segment this package would plausibly produce — so the test still catches a leaked
    // absolute path even when CI's checkout root differs from the one it was built on.
    const looksAbsolute = /(?:^|[\s"'(])(?:\/home\/|\/Users\/|\/root\/|\/tmp\/|[A-Za-z]:\\)\S*[/\\](?:src|packages)[/\\]/;
    const offenders: string[] = [];
    for (const entry of readdirSync(distDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = join(entry.parentPath, entry.name).slice(distDir.length + 1);
      const text = readFileSync(join(distDir, name), 'utf8');
      if (text.includes(packageDir)) offenders.push(name);
      else if (looksAbsolute.test(text)) offenders.push(`${name} (path-shaped string)`);
      if (name.endsWith('.map')) {
        const map = JSON.parse(text) as { file?: string; sourceRoot?: string; sources?: string[] };
        const paths = [map.file ?? '', map.sourceRoot ?? '', ...(map.sources ?? [])];
        if (paths.some((p) => isAbsolute(p))) offenders.push(`${name} (absolute file/sourceRoot/sources)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the path resolver detects an exports entry pointing to a file the build did not generate', () => {
    const broken = {
      ...pkg,
      exports: { '.': { import: './dist/does-not-exist.js', require: './dist/index.cjs' } },
    };
    expect(findMissingPaths(broken, packageDir)).toEqual(['./dist/does-not-exist.js']);
  });

  it('the path resolver detects a missing main/module/types file', () => {
    expect(findMissingPaths({ main: './dist/nope.cjs' }, packageDir)).toEqual(['./dist/nope.cjs']);
    expect(findMissingPaths({ module: './dist/nope.js' }, packageDir)).toEqual(['./dist/nope.js']);
    expect(findMissingPaths({ types: './dist/nope.d.ts' }, packageDir)).toEqual([
      './dist/nope.d.ts',
    ]);
  });

  it('declares react and react-dom as peerDependencies with the right range, not dependencies', () => {
    const peers = pkg.peerDependencies as Record<string, string>;
    expect(peers.react).toBe('^18.0.0 || ^19.0.0');
    expect(peers['react-dom']).toBe('^18.0.0 || ^19.0.0');
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    expect(deps).not.toHaveProperty('react');
    expect(deps).not.toHaveProperty('react-dom');
  });

  it('declares sideEffects limited to CSS files (an imported stylesheet is never tree-shaken)', () => {
    expect(pkg.sideEffects).toEqual(['**/*.css']);
  });

  it('exposes styles.css and theme.css in exports and builds them into dist', () => {
    const exportsMap = pkg.exports as Record<string, unknown>;
    expect(exportsMap['./styles.css']).toBe('./dist/styles.css');
    expect(exportsMap['./theme.css']).toBe('./dist/theme.css');
    const files = readdirSync(distDir);
    expect(files).toContain('styles.css');
    expect(files).toContain('theme.css');
  });

  // NOTE: today `src` only imports React *types*, so this passes trivially. It becomes a real
  // guard as soon as a module imports React at runtime (tsup `external` must keep it out).
  it('does not bundle React sources into dist', () => {
    const bundled = readdirSync(distDir)
      .filter((f) => /\.(js|cjs)$/.test(f))
      .map((f) => readFileSync(join(distDir, f), 'utf8'))
      .join('\n');
    expect(bundled.length).toBeGreaterThan(0);
    expect(bundled).not.toMatch(
      /__SECRET_INTERNALS_DO_NOT_USE|react\.production|ReactCurrentOwner|react-dom\.production/,
    );
  });

  // `useObjectPageForm({ schema })` speaks Standard Schema through structural types only: no schema
  // library (nor `@standard-schema/spec`) may become a runtime or peer dependency, or reach dist.
  it('depends on no schema library: zod is a test-only devDependency and never reaches dist', () => {
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = (pkg[field] ?? {}) as Record<string, string>;
      expect(Object.keys(deps).filter((d) => /zod|valibot|arktype|standard-schema/.test(d))).toEqual([]);
    }
    const bundled = readdirSync(distDir)
      .filter((f) => /\.(js|cjs|d\.ts|d\.cts)$/.test(f))
      .map((f) => readFileSync(join(distDir, f), 'utf8'))
      .join('\n');
    expect(bundled).not.toMatch(/from ['"]zod|require\(['"]zod|@standard-schema\/spec/);
  });

  // The demo universe (`src/internal/demo-data/`, ticket #513) feeds stories, examples and tests only:
  // no published file may carry it. The name is read from the module, not repeated here.
  it('no published file carries the demo universe (DEMO_COMPANY, the company name or its domain)', () => {
    const word = DEMO_COMPANY.name.split(' ')[0]!;
    const offenders: string[] = [];
    for (const entry of readdirSync(distDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = join(entry.parentPath, entry.name).slice(distDir.length + 1);
      const text = readFileSync(join(distDir, name), 'utf8');
      if (text.includes('DEMO_COMPANY')) offenders.push(`${name}: DEMO_COMPANY`);
      if (text.toLowerCase().includes(word.toLowerCase())) offenders.push(`${name}: ${word}`);
      if (text.includes('demo-data')) offenders.push(`${name}: demo-data`);
    }
    expect(word.length).toBeGreaterThan(3);
    expect(offenders).toEqual([]);
  });

  // Ticket #514 extends the same guarantee to the transactional documents. The boundary itself is
  // guaranteed by the test above, on the string `demo-data` (it is in the seeds, `hashSeed('demo-data/...')`,
  // and in the source maps of every module of the universe). This test adds what can be checked without
  // trusting names that a minifier would rename: the TEXT the generators produce, taken from the
  // generators themselves (a document number, a status label, the sentences of a comment).
  it('no published file carries the demo documents (names, document numbers, generated texts)', () => {
    const names = /makeSalesOrders|getSalesOrder|makePurchaseOrders|getPurchaseOrder|makeInvoices|getInvoice\b|makeSupportCases|getSupportCase|SALES_ORDER_STATUS|PURCHASE_ORDER_STATUS|INVOICE_STATUS|SUPPORT_CASE_/;
    const numbers = /\b(SO|PO|INV)-\d{4}-\d{9}\b|\bCS-\d{5}\b/;
    const generated = [
      makeSalesOrders(1)[0]!.number,
      makePurchaseOrders(1)[0]!.number,
      makeInvoices(1)[0]!.number,
      makeSupportCases(1)[0]!.number,
      SUPPORT_CASE_STATUS_LABEL.pending,
      // Sentences of the first comments that do not carry a SKU (the SKU is substituted at run time).
      ...Array.from({ length: 60 }, (_, i) => getSupportCase(`cs-${i + 1}`)!.comments)
        .flat()
        .flatMap((comment) => comment.text.split(/(?<=[.?]) /))
        .filter((sentence) => sentence.length > 20 && !/[A-Z]{3}-\d{5}/.test(sentence)),
    ];
    // The checks are not vacuous: they match what the generators produce.
    expect(names.test('makeSalesOrders(1)') && numbers.test(makeSalesOrders(1)[0]!.number) && numbers.test(makeSupportCases(1)[0]!.number)).toBe(true);
    expect(generated.length).toBeGreaterThan(30);
    const offenders: string[] = [];
    for (const entry of readdirSync(distDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = join(entry.parentPath, entry.name).slice(distDir.length + 1);
      const text = readFileSync(join(distDir, name), 'utf8');
      if (names.test(text)) offenders.push(`${name}: generator or label name`);
      if (numbers.test(text)) offenders.push(`${name}: document number`);
      for (const literal of generated) if (text.includes(literal)) offenders.push(`${name}: "${literal}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('no non-test, non-story module under src imports zod', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name)) {
          if (/from ['"]zod(\/[^'"]*)?['"]|import\(['"]zod/.test(readFileSync(full, 'utf8'))) offenders.push(full);
        }
      }
    };
    walk(join(packageDir, 'src'));
    expect(offenders).toEqual([]);
  });
});
