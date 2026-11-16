// Entry of `@formrail/pro/tanstack-form` (ticket #508): the adapter that binds a TanStack Form form to the
// `RebaseFormBinding` contract of `@formrail/pro/engine`. `@tanstack/react-form` is an optional peer used for the types
// only (nothing reached from here imports `@tanstack/*` at runtime) and nothing reached from here names
// `@formrail/core` or `react-hook-form`: `test/tanstack-form-boundary.test.ts` walks the sources,
// `test/dist.tanstack-form.test.ts` the built files. The main entry `@formrail/pro` does not re-export it: its
// declaration files would name `@tanstack/react-form`.
export { useTanStackFormBinding } from './integrations/tanstack-form/use-tanstack-form-binding';
export type { TanStackFormOf, UseTanStackFormBindingOptions } from './integrations/tanstack-form/use-tanstack-form-binding';
