// Entry of `@formrail/pro/react-hook-form` (ticket #507): the adapter that binds a React Hook Form form to the
// `RebaseFormBinding` contract of `@formrail/pro/engine`. `react-hook-form` is an optional peer used for the types
// only (nothing reached from here imports it at runtime) and nothing reached from here names `@formrail/core`:
// `test/react-hook-form-boundary.test.ts` walks the sources, `test/dist.react-hook-form.test.ts` the built files.
// The main entry `@formrail/pro` does not re-export it: its declaration files would name `react-hook-form`.
export { useReactHookFormBinding } from './integrations/react-hook-form/use-react-hook-form-binding';
export type { UseReactHookFormBindingOptions } from './integrations/react-hook-form/use-react-hook-form-binding';
