import { create } from 'storybook/theming';

// Colours and fonts are the design-system tokens of packages/core/src/styles/tokens.css, copied as
// literals because Storybook's theming API needs concrete colour strings (not CSS variables).
// Keep in sync with tokens.css when the values there change.
export const ropTheme = create({
  base: 'light',
  brandTitle: 'react-object-page',
  brandUrl: 'https://github.com/Utumno1984/react-object-page',
  brandTarget: '_blank',

  colorPrimary: '#0a6ed1', // --color-rop-blue-600 / --color-rop-primary
  colorSecondary: '#0a6ed1', // active/selected state in the sidebar and toolbar

  appBg: '#f5f6f7', // --color-rop-surface-subtle
  appContentBg: '#ffffff', // --color-rop-surface
  appPreviewBg: '#ffffff',
  appBorderColor: '#c4cdd6', // --color-rop-border-subtle
  appBorderRadius: 8, // --radius-rop-md

  textColor: '#1d2d3e', // --color-rop-text
  textInverseColor: '#ffffff', // --color-rop-primary-contrast
  textMutedColor: '#556b82', // --color-rop-text-muted

  barTextColor: '#556b82',
  barSelectedColor: '#0a6ed1',
  barHoverColor: '#0a6ed1',
  barBg: '#ffffff',

  inputBg: '#ffffff',
  inputBorder: '#7b8fa5', // --color-rop-border (3:1 outline)
  inputTextColor: '#1d2d3e',
  inputBorderRadius: 4, // --radius-rop-sm

  fontBase: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", // --font-rop-sans
  fontCode: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace", // --font-rop-mono
});
