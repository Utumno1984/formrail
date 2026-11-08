// Internal: the height arithmetic of `Textarea` `autoResize`. Not exported from the package.

export interface AutoHeightInput {
  /** `scrollHeight` of the control measured with `height: auto` (content + vertical padding, no border). */
  scrollHeight: number;
  /** Computed line height in px. */
  lineHeight: number;
  paddingY: number;
  borderY: number;
  boxSizing: string;
  /** Minimum number of rows. */
  rows: number;
  /** Maximum number of rows; absent: unlimited. */
  maxRows?: number | undefined;
}

export interface AutoHeight {
  /** Value for `style.height`, in px, for the control's own `box-sizing`. */
  height: number;
  /** The content is taller than `maxRows` lines: the control must scroll inside. */
  clamped: boolean;
}

/** Sub-pixel slack: `scrollHeight` is an integer while line heights may be fractional. */
const EPSILON = 0.5;

export function computeAutoHeight(input: AutoHeightInput): AutoHeight {
  const { scrollHeight, lineHeight, paddingY, borderY, boxSizing, rows, maxRows } = input;
  const content = scrollHeight - paddingY;
  const min = rows * lineHeight;
  const max = maxRows === undefined ? Infinity : Math.max(rows, maxRows) * lineHeight;
  const clamped = content > max + EPSILON;
  const inner = Math.min(Math.max(content, min), max);
  return { height: boxSizing === 'border-box' ? inner + paddingY + borderY : inner, clamped };
}

/** Computed line height in px; `normal` (no explicit value) falls back to 1.2 × the font size. */
export function readLineHeight(style: CSSStyleDeclaration): number {
  const lh = parseFloat(style.lineHeight);
  if (Number.isFinite(lh)) return lh;
  const fontSize = parseFloat(style.fontSize);
  return (Number.isFinite(fontSize) ? fontSize : 16) * 1.2;
}
