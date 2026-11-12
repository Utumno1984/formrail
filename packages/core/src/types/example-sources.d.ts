// The copy-paste example files of the Storybook build (ticket #447), served by
// .storybook/example-sources-plugin.mjs and read by src/internal/example-story.ts (story-only).
declare module 'virtual:formrail/example-sources' {
  const sources: import('../internal/example-lookup').ExampleSource[];
  export default sources;
}
