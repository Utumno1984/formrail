// Production-bundle check for the development diagnostics (ticket #687). A consumer's production build
// (esbuild or Vite, `NODE_ENV=production`, minified) must contain no trace of the library name: neither
// the `[formrail] <Component>: ...` diagnostics nor the invariant-error prefix. A guard hidden behind a
// function call (`isDev()`), or a module-level message constant read after an early return, survives
// both bundlers as a dead string, so the only way to know is to bundle for real and look.
import { build as esbuildBuild } from "esbuild";
import { build as viteBuild } from "vite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

/** The library name in any case: the prefix, a component name, a package specifier, a URL. */
export const LIBRARY_NAME = /formrail/gi;

/**
 * Module specifiers are not diagnostics: `@formrail/core` stays external in the Pro bundles and its
 * import specifier is the only occurrence there. They are blanked before counting.
 */
export function stripSpecifiers(code) {
  return code.replace(
    /(\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(["'`])[^"'`]*\2/g,
    '$1""',
  );
}

/** Occurrences of the library name in `code`, specifiers and `sourceMappingURL` comments excluded. */
export function occurrences(code) {
  const text = stripSpecifiers(code).replace(/\/\/# sourceMappingURL=.*/g, "");
  return [...text.matchAll(LIBRARY_NAME)].length;
}

/** A short excerpt around the first occurrence, for the assertion message. */
export function firstExcerpt(code) {
  const text = stripSpecifiers(code);
  const at = text.search(/formrail/i);
  return at < 0 ? "" : text.slice(Math.max(0, at - 40), at + 120);
}

const isBare = (id) =>
  !id.startsWith(".") &&
  !id.startsWith("\0") &&
  !isAbsolute(id) &&
  !/^[a-zA-Z]:[\\/]/.test(id);

async function withEntry(code, run) {
  const dir = mkdtempSync(join(tmpdir(), "formrail-prod-diag-"));
  try {
    const entry = join(dir, "entry.js");
    writeFileSync(entry, code);
    return await run(entry, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Entry source that pulls in the whole module namespace (a bare import would be tree-shaken to nothing). */
export const namespaceEntry = (file) =>
  `import * as F from ${JSON.stringify(file)};\nglobalThis.x = F;\n`;
export const requireEntry = (file) =>
  `globalThis.x = require(${JSON.stringify(file)});\n`;

/** Bundles `entryCode` like a consumer would; bare specifiers (peers, dependencies) stay external. */
export async function bundleWithEsbuild(
  entryCode,
  { nodeEnv = "production", format = "esm" } = {},
) {
  return withEntry(entryCode, async (entry) => {
    const result = await esbuildBuild({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format,
      platform: "browser",
      target: "es2022",
      packages: "external",
      define: { "process.env.NODE_ENV": JSON.stringify(nodeEnv) },
      write: false,
      logLevel: "silent",
    });
    return result.outputFiles.map((f) => f.text).join("\n");
  });
}

/** Same with Vite (programmatic `build()`, Rolldown); production relies on Vite's own `mode` handling. */
export async function bundleWithVite(
  entryCode,
  { nodeEnv = "production" } = {},
) {
  return withEntry(entryCode, async (entry, dir) => {
    const production = nodeEnv === "production";
    // `vite build` runs with NODE_ENV=production; Vite only fills it in when unset, and Vitest sets it to
    // `test`. Same environment as the CLI here, restored afterwards.
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = nodeEnv;
    let result;
    try {
      result = await viteBuild({
        root: dir,
        configFile: false,
        logLevel: "silent",
        mode: production ? "production" : "development",
        ...(production
          ? {}
          : { define: { "process.env.NODE_ENV": JSON.stringify(nodeEnv) } }),
        build: {
          write: false,
          minify: true,
          modulePreload: false,
          rollupOptions: {
            input: entry,
            external: isBare,
            output: { format: "es" },
          },
        },
      });
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(
      (r) => r.output,
    );
    return outputs.map((o) => (o.type === "chunk" ? o.code : "")).join("\n");
  });
}
