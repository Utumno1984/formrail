// Runtime check without @formrail/core (CommonJS, ticket #507): requires @formrail/pro/react-hook-form.
const adapter = require('@formrail/pro/react-hook-form');

console.log(JSON.stringify({ exports: Object.keys(adapter).filter((key) => key !== '__esModule').sort(), hook: typeof adapter.useReactHookFormBinding }));
