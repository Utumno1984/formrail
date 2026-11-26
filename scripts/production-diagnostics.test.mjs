// Ticket #687: the development diagnostics must not reach a consumer's production bundle.
// Needs the built `dist/` of both packages (`npm run build`), like `bundle:check`.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bundleWithEsbuild,
  bundleWithVite,
  firstExcerpt,
  namespaceEntry,
  occurrences,
  requireEntry,
  stripSpecifiers,
} from "./production-diagnostics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = (pkg, file) => {
  const path = resolve(ROOT, "packages", pkg, "dist", file);
  if (!existsSync(path))
    throw new Error(`${path} not found. Run \`npm run build\` first.`);
  return path;
};

const CORE_ENTRIES = ["index.js", "internal.js"];
const PRO_ENTRIES = [
  "index.js",
  "engine.js",
  "react-hook-form.js",
  "tanstack-form.js",
];

// Messages that must be present in a development bundle: if someone "fixes" the production check by
// deleting the diagnostics, the development half of these tests fails.
const CORE_DEV_MESSAGES = [
  "[formrail] <AppSwitcher>",
  "[formrail] <AppLauncher>",
  "[formrail] <Calendar>",
  "[formrail] <Icon>",
  "[formrail] useListReport",
];
const PRO_DEV_MESSAGES = {
  "index.js": "[formrail/pro] ",
  "engine.js": "[formrail/pro] ",
  "react-hook-form.js": "[formrail] useReactHookFormBinding",
  "tanstack-form.js": "[formrail] useTanStackFormBinding",
};

const bundlers = { esbuild: bundleWithEsbuild, vite: bundleWithVite };

describe("production bundles of @formrail/core carry no diagnostics", () => {
  for (const [name, bundle] of Object.entries(bundlers)) {
    for (const entry of CORE_ENTRIES) {
      it(`${name}, dist/${entry}: 0 occurrences of the library name`, async () => {
        const code = await bundle(namespaceEntry(dist("core", entry)));
        expect(code.length).toBeGreaterThan(1000);
        expect(occurrences(code), firstExcerpt(code)).toBe(0);
      }, 60_000);
    }
  }

  it("esbuild, CommonJS dist/index.cjs (iife): 0 occurrences", async () => {
    const code = await bundleWithEsbuild(
      requireEntry(dist("core", "index.cjs")),
      { format: "iife" },
    );
    expect(code.length).toBeGreaterThan(1000);
    expect(occurrences(code), firstExcerpt(code)).toBe(0);
  }, 60_000);

  it("esbuild, CommonJS dist/internal.cjs (iife): 0 occurrences", async () => {
    const code = await bundleWithEsbuild(
      requireEntry(dist("core", "internal.cjs")),
      { format: "iife" },
    );
    expect(occurrences(code), firstExcerpt(code)).toBe(0);
  }, 60_000);

  for (const [name, bundle] of Object.entries(bundlers)) {
    it(`${name}, development control: the same entry carries the expected messages`, async () => {
      const code = await bundle(namespaceEntry(dist("core", "index.js")), {
        nodeEnv: "development",
      });
      for (const message of CORE_DEV_MESSAGES)
        expect(code, message).toContain(message);
    }, 60_000);
  }
});

// The texts built by the problem-list builders (appSwitcherProblems, appLauncherProblems,
// navLinkProblems) are not guarded by their own call site's `[formrail]` prefix, so they need an
// explicit check: the whole computation must sit in the development branch.
const BUILDER_TEXTS = [
  "ids must be unique",
  "has an empty label",
  "opens nothing",
  "onNavigate is not used",
];

describe("problem-list builders are tree-shaken from production bundles of @formrail/core", () => {
  for (const [name, bundle] of Object.entries(bundlers)) {
    it(`${name}: production bundle has none of the builder texts`, async () => {
      const code = await bundle(namespaceEntry(dist("core", "index.js")));
      for (const text of BUILDER_TEXTS) expect(code, text).not.toContain(text);
    }, 60_000);

    it(`${name}: development control has all of the builder texts`, async () => {
      const code = await bundle(namespaceEntry(dist("core", "index.js")), {
        nodeEnv: "development",
      });
      for (const text of BUILDER_TEXTS) expect(code, text).toContain(text);
    }, 60_000);
  }
});

describe("production bundles of @formrail/pro carry no diagnostics", () => {
  for (const [name, bundle] of Object.entries(bundlers)) {
    for (const entry of PRO_ENTRIES) {
      it(`${name}, dist/${entry}: 0 occurrences of the library name`, async () => {
        const code = await bundle(namespaceEntry(dist("pro", entry)));
        expect(code.length).toBeGreaterThan(300);
        expect(occurrences(code), firstExcerpt(code)).toBe(0);
      }, 60_000);
    }
  }

  for (const [name, bundle] of Object.entries(bundlers)) {
    for (const entry of PRO_ENTRIES) {
      it(`${name}, development control, dist/${entry}: the expected message is present`, async () => {
        const code = await bundle(namespaceEntry(dist("pro", entry)), {
          nodeEnv: "development",
        });
        expect(code).toContain(PRO_DEV_MESSAGES[entry]);
      }, 60_000);
    }
  }
});

describe("the check itself catches a regression (negative fixtures)", () => {
  const OLD_SCHEME = `
    const isDev = () => { try { return process.env.NODE_ENV !== 'production'; } catch { return true; } };
    export function probe() { if (isDev()) console.error('[formrail] probe'); }
    globalThis.probe = probe;
  `;
  const ORPHAN_CONSTANT = `
    var PREFIX = '[formrail] <Probe>';
    export function probe() {
      if (process.env.NODE_ENV === 'production') return;
      console.error(PREFIX);
    }
    globalThis.probe = probe;
  `;
  const GUARDED = `
    export function probe() {
      if (process.env.NODE_ENV !== 'production') console.error('[formrail] probe');
    }
    globalThis.probe = probe;
  `;

  it("esbuild: the old isDev() function-call scheme is reported", async () => {
    expect(occurrences(await bundleWithEsbuild(OLD_SCHEME))).toBeGreaterThan(0);
  });
  it("vite: the old isDev() function-call scheme is reported", async () => {
    expect(occurrences(await bundleWithVite(OLD_SCHEME))).toBeGreaterThan(0);
  });
  it("esbuild: a module-level message constant read after an early return is reported", async () => {
    expect(
      occurrences(await bundleWithEsbuild(ORPHAN_CONSTANT)),
    ).toBeGreaterThan(0);
  });
  it("the inline guard passes the same check (esbuild and vite)", async () => {
    expect(occurrences(await bundleWithEsbuild(GUARDED))).toBe(0);
    expect(occurrences(await bundleWithVite(GUARDED))).toBe(0);
  });
  it("import specifiers are not counted, a message next to one is", () => {
    expect(
      occurrences(
        'import{a}from"@formrail/core";import("@formrail/core/internal");require("@formrail/core")',
      ),
    ).toBe(0);
    expect(
      occurrences(
        'import{a}from"@formrail/core";console.error("[formrail] x")',
      ),
    ).toBe(1);
    expect(stripSpecifiers('import{a}from"@formrail/core"')).toBe(
      'import{a}from""',
    );
  });
});

describe("no isDev helper is left in the sources", () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.(ts|tsx)$/.test(entry) && !/\.(test|stories)\.tsx?$/.test(entry)
        ? [path]
        : [];
    });
  it("packages/core/src and packages/pro/src define and call no isDev", () => {
    const offenders = ["core", "pro"]
      .flatMap((pkg) => walk(resolve(ROOT, "packages", pkg, "src")))
      .filter((file) => /\bisDev\b|is-dev/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
