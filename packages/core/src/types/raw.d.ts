declare module '*.css?raw' {
  const css: string;
  export default css;
}

// The text of a copy-paste example (ticket #403): `import code from './X.example.tsx?raw'` is what the
// example story prints as "Show code" (see src/internal/story-example.ts).
declare module '*.example.tsx?raw' {
  const code: string;
  export default code;
}

// The text of a showcase source file, shown in a `Source` block of its Docs page (ticket #403).
declare module '*.tsx?raw' {
  const code: string;
  export default code;
}

declare module '*.ts?raw' {
  const code: string;
  export default code;
}
