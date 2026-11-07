import type { Meta, StoryObj } from '@storybook/react-vite';
import tokensCss from '../styles/tokens.css?raw';
import { parseDerivedTokens, parseTokenScale } from '../utils/token-scale';

// Palette, type scale and z-index list are derived from tokens.css (the source of the package's
// styles.css): a new token shows up here with no edit. The CSS itself comes from the same entry
// Storybook loads in .storybook/preview.ts.
const scale = parseTokenScale(tokensCss);

// A derived token is unset by default, so a bare `var()` of its name paints nothing: its swatch is
// written as the compiled utilities are, `var(<token>, <formula>)`.
const derived = parseDerivedTokens(tokensCss);
const swatchColor = (name: string): string => {
  const token = `--color-${name}`;
  const formula = derived.get(token);
  return formula === undefined ? `var(${token})` : `var(${token}, ${formula})`;
};

// The derived tokens live in their own block at the end of tokens.css: each swatch goes back next
// to the colour it belongs with. Any other token, a new one included, keeps the file's order.
const SWATCH_AFTER: [name: string, anchor: string][] = [
  ['rop-surface-pressed', 'rop-surface-subtle'],
  ['rop-primary-hover', 'rop-primary'],
  ['rop-primary-active', 'rop-primary-hover'],
  ['rop-error-hover', 'rop-error'],
  ['rop-error-active', 'rop-error-hover'],
];
const palette = SWATCH_AFTER.reduce((names, [name, anchor]) => {
  if (!names.includes(name) || !names.includes(anchor)) {
    throw new Error(`Foundations/Tokens: "${name}" or its anchor "${anchor}" is not in tokens.css`);
  }
  const rest = names.filter((n) => n !== name);
  rest.splice(rest.indexOf(anchor) + 1, 0, name);
  return rest;
}, scale.color);

const meta = {
  title: 'Foundations/Tokens',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const readVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const section = { margin: '0 0 32px' } as const;
const heading = { margin: '0 0 12px', fontSize: 'var(--text-rop-title-sm)', lineHeight: 'var(--text-rop-title-sm--line-height)' } as const;

function Tokens() {
  // Read synchronously (the stylesheet is loaded before the story renders): no layout shift.
  const zLayers = scale['z-index']
    .map((name) => ({ name, value: readVar(`--z-index-${name}`) }))
    .sort((a, b) => Number(a.value) - Number(b.value));

  return (
    <div
      style={{
        maxWidth: 640,
        color: 'var(--color-rop-text)',
        background: 'var(--color-rop-surface)',
        fontFamily: 'var(--font-rop-sans)',
        fontSize: 'var(--text-rop-body)',
        lineHeight: 'var(--text-rop-body--line-height)',
      }}
    >
      <section style={section} aria-labelledby="tokens-palette">
        <h2 id="tokens-palette" style={heading}>
          Palette
        </h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {palette.map((name) => (
            <li key={name}>
              <div
                data-testid={`swatch-${name}`}
                style={{ height: 40, background: swatchColor(name), border: '1px solid var(--color-rop-border)', borderRadius: 'var(--radius-rop-md)' }}
              />
              <code style={{ fontFamily: 'var(--font-rop-mono)', fontSize: 'var(--text-rop-caption)' }}>{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section style={section} aria-labelledby="tokens-type">
        <h2 id="tokens-type" style={heading}>
          Typography
        </h2>
        {scale.text.map((name) => (
          <p
            key={name}
            style={{ margin: 0, fontSize: `var(--text-${name})`, lineHeight: `var(--text-${name}--line-height)` }}
          >
            {name}: The quick brown fox jumps over the lazy dog
          </p>
        ))}
        <p style={{ margin: '12px 0 0' }}>
          Identifier in monospace:{' '}
          <code data-testid="mono-sample" style={{ fontFamily: 'var(--font-rop-mono)' }}>
            INV-2026-00042 / 0O1lI
          </code>
        </p>
      </section>

      <section style={section} aria-labelledby="tokens-z">
        <h2 id="tokens-z" style={heading}>
          z-index scale (lowest first)
        </h2>
        <ol data-testid="z-scale" style={{ margin: 0, paddingLeft: 24 }}>
          {zLayers.map(({ name, value }) => (
            <li key={name}>
              <code style={{ fontFamily: 'var(--font-rop-mono)' }}>
                {name}: {value}
              </code>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** Palette, type scale (with a monospace identifier) and the ordered z-index scale. */
export const Overview: Story = {
  tags: ['visual'],
  render: () => <Tokens />,
};
