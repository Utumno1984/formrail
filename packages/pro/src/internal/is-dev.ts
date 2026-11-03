// Local equivalent of core's internal helper (pro never imports core internals).
// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
// Module-scoped declaration: the package compiles without Node types and the literal
// `process.env.NODE_ENV` the bundlers look for stays in the output.
declare const process: { env: { NODE_ENV?: string } };

export const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};
