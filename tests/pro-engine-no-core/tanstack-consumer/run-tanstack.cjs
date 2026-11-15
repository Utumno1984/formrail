// Runtime check without @formrail/core and without react-hook-form (CommonJS, ticket #508): requires
// @formrail/pro/tanstack-form.
const adapter = require('@formrail/pro/tanstack-form');

console.log(JSON.stringify({ exports: Object.keys(adapter).filter((key) => key !== '__esModule'), hook: typeof adapter.useTanStackFormBinding }));
