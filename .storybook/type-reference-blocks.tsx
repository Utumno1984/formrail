// MDX blocks of the hook/type reference (ticket #402): `<TypeReference name="UseListReportOptions" />` and
// `<FunctionReference name="useListReport" />` render the TSDoc of the sources, extracted at build time by
// scripts/type-reference.mjs (served by type-reference-plugin.mjs). Nothing here is written by hand: a TSDoc
// edit shows up on the next build (or on reload, in the dev server).
//
// Plain HTML elements (h3, table, p) on purpose: inside a Docs page Storybook styles them with the Docs theme
// (`ropTheme`), so a reference looks like the rest of the page. Only what that styling lacks is set here: the
// horizontal scroll container (a wide table scrolls inside it on a phone, not the whole page), the code font of
// the types, the anchors.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnchorMdx, HeaderMdx, Markdown } from '@storybook/addon-docs/blocks';
import { styled } from 'storybook/theming';
import reference, { type ReferenceMember, type ReferenceTypeEntry, type ReferenceVariant } from 'virtual:formrail/type-reference';

/** Shape version the blocks understand (REFERENCE_VERSION of scripts/type-reference.mjs). */
const SUPPORTED_VERSION = 1;

/** Anchor id: `slug('UseListReportOptions', 'columns')` -> `uselistreportoptions-columns`. */
export const slug = (...parts: string[]): string =>
  parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Which rendering of the same reference this one is on the page (0 for the first): the second
 * `<TypeReference name="X">` of a page gets `x-2-...` ids and "(2)" in its region names, so no id and no
 * accessible name is repeated. The first keeps the plain ids, which are the deep links.
 */
function useOccurrence(name: string) {
  const ref = useRef<HTMLElement>(null);
  const [occurrence, setOccurrence] = useState(0);
  useLayoutEffect(() => {
    const all = Array.from(document.querySelectorAll(`[data-type-reference="${CSS.escape(name)}"]`));
    setOccurrence(Math.max(0, all.indexOf(ref.current as Element)));
  }, [name]);
  return { ref, occurrence, key: occurrence > 0 ? `${name}-${occurrence + 1}` : name, suffix: occurrence > 0 ? ` (${occurrence + 1})` : '' };
}

/** Name of the parameters region of a signature: the overload number when there are several. */
export const parametersLabel = (name: string, index: number, count: number): string =>
  count > 1 ? `${name} parameters, overload ${index + 1} of ${count}` : `${name} parameters`;

function entryOf(name: string) {
  if (reference.version !== SUPPORTED_VERSION) {
    throw new Error(`Type reference: version ${reference.version}, the blocks expect ${SUPPORTED_VERSION}.`);
  }
  const entry = reference.entries[name];
  // Fail loudly: a typo in an MDX page, or a type renamed in the sources, must not ship an empty section.
  if (!entry) throw new Error(`Type reference: "${name}" is not a public export of @formrail/core or @formrail/pro.`);
  return entry;
}

const Code = styled.code(({ theme }) => ({
  fontFamily: theme.typography.fonts.mono,
  fontSize: theme.typography.size.s2 - 1,
  lineHeight: 1.5,
  color: theme.color.defaultText,
  // Long types wrap at their spaces instead of widening the column without end (`break-word`, unlike
  // `anywhere`, does not shrink the column to one character: a name is never split while it fits).
  whiteSpace: 'normal',
  overflowWrap: 'break-word',
}));

// Rendered with `sb-unstyled`: the Docs styles of a `pre` would override these.
const Pre = styled.pre(({ theme }) => ({
  fontFamily: theme.typography.fonts.mono,
  fontSize: theme.typography.size.s2 - 1,
  lineHeight: 1.6,
  margin: '12px 0',
  padding: '10px 14px',
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius,
  background: theme.background.hoverable,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
}));

/** The scroll container of a table: a wide table scrolls here, not the page. A tab stop, so a keyboard user can scroll it. */
const Scroller = styled.div({
  overflowX: 'auto',
  maxWidth: '100%',
  margin: '12px 0 24px',
  '& > table': { margin: 0, minWidth: 640, width: '100%' },
  '& td, & th': { verticalAlign: 'top', textAlign: 'left' },
  // Name on one line; the type wraps within a readable width; the description takes what is left.
  '& tbody th': { whiteSpace: 'nowrap' },
  '& td:nth-of-type(1)': { minWidth: 160, maxWidth: 320 },
  '& td:nth-of-type(2), & td:nth-of-type(3)': { whiteSpace: 'nowrap' },
  '& td:last-of-type': { minWidth: 260 },
  // Deep link: the row lands below the top edge, not under it.
  '& tr[id]': { scrollMarginTop: 16 },
  '& tr[id]:target': { outline: '2px solid currentColor', outlineOffset: -2 },
});

const Muted = styled.span(({ theme }) => ({ color: theme.textMutedColor, fontSize: theme.typography.size.s2 }));

/**
 * A public type name inside a type text links to its reference when that reference is on the same page
 * (found by its anchor once the page has rendered), and stays plain text otherwise: never a dead link.
 */
function TypeName({ name }: { name: string }) {
  const id = slug(name);
  const [onPage, setOnPage] = useState(false);
  useEffect(() => setOnPage(document.getElementById(id) !== null), [id]);
  return onPage ? (
    <AnchorMdx href={`#${id}`} target="_self">
      {name}
    </AnchorMdx>
  ) : (
    <>{name}</>
  );
}

/** A type as written in the source, with the public type names in it linked (see `TypeName`). */
export function TypeText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const name = match[0];
    if (!Object.hasOwn(reference.entries, name)) continue;
    const index = match.index;
    if (index > last) parts.push(text.slice(last, index));
    parts.push(<TypeName key={index} name={name} />);
    last = index + name.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function Description({ member }: { member: Pick<ReferenceMember, 'description' | 'deprecated' | 'examples'> }) {
  return (
    <>
      {member.deprecated ? <Markdown>{`**Deprecated.** ${member.deprecated}`}</Markdown> : null}
      {member.description ? <Markdown>{member.description}</Markdown> : null}
      {(member.examples ?? []).map((example, index) => (
        <Markdown key={index}>{example}</Markdown>
      ))}
    </>
  );
}

function MembersTable({ owner, label, members }: { owner: string; label: string; members: ReferenceMember[] }) {
  return (
    // A tab stop: a scrollable region must be reachable from the keyboard (axe `scrollable-region-focusable`).
    <Scroller role="region" aria-label={label} tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Required</th>
            <th scope="col">Default</th>
            <th scope="col">Description</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const id = slug(owner, member.name);
            return (
              <tr key={member.name} id={id}>
                <th scope="row">
                  <AnchorMdx href={`#${id}`} target="_self">
                    <Code>
                      {member.rest ? '...' : ''}
                      {member.name}
                    </Code>
                  </AnchorMdx>
                </th>
                <td>
                  <Code>
                    <TypeText text={member.type} />
                  </Code>
                </td>
                <td>{member.optional ? 'No' : 'Yes'}</td>
                <td>{member.default !== undefined ? <Code>{member.default}</Code> : <Muted>—</Muted>}</td>
                <td>
                  <Description member={member} />
                  {member.inheritedFrom ? (
                    <Muted>
                      Inherited from{' '}
                      <Code>
                        <TypeText text={member.inheritedFrom} />
                      </Code>
                      .
                    </Muted>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Scroller>
  );
}

function Heading({ id, level, children }: { id: string; level: 'h3' | 'h4'; children: ReactNode }) {
  return (
    <HeaderMdx as={level} id={id}>
      {children}
    </HeaderMdx>
  );
}

const withTypeParameters = (name: string, typeParameters: string[]) => (typeParameters.length > 0 ? `${name}<${typeParameters.join(', ')}>` : name);

function variantTitle(variant: ReferenceVariant): ReactNode {
  if (!variant.requires?.length) return variant.title;
  return (
    <>
      {variant.title}: with{' '}
      {variant.requires.map((name, index) => (
        <span key={name}>
          {index > 0 ? ', ' : ''}
          <code>{name}</code>
        </span>
      ))}
    </>
  );
}

export interface TypeReferenceProps {
  /** A type or interface exported by `@formrail/core` or `@formrail/pro`. */
  name: string;
}

/** The reference of an exported type or interface: description, then one row per member. */
export function TypeReference({ name }: TypeReferenceProps) {
  const entry = entryOf(name);
  if (entry.kind === 'function') throw new Error(`Type reference: "${name}" is a function, use <FunctionReference>.`);
  const typeEntry: ReferenceTypeEntry = entry;
  const { ref, key, suffix } = useOccurrence(name);
  const id = slug(key);
  const title = withTypeParameters(name, typeEntry.typeParameters);
  return (
    <section ref={ref} aria-labelledby={id} data-type-reference={name}>
      <Heading id={id} level="h3">
        <code>{title}</code>
      </Heading>
      <p>
        <Muted>
          {typeEntry.kind === 'interface' ? 'Interface' : 'Type'} · <code>{typeEntry.package}</code>
        </Muted>
      </p>
      <Description member={typeEntry} />
      {typeEntry.definition ? (
        <Pre className="sb-unstyled">
          type {title} = <TypeText text={typeEntry.definition} />;
        </Pre>
      ) : null}
      {typeEntry.members && typeEntry.members.length > 0 ? (
        <MembersTable
          owner={key}
          label={`${typeEntry.variants ? `${name}: members of every variant` : `${name} members`}${suffix}`}
          members={typeEntry.members}
        />
      ) : null}
      {(typeEntry.variants ?? []).map((variant) => {
        const variantId = slug(key, variant.title);
        return (
          <div key={variant.title}>
            <Heading id={variantId} level="h4">
              {variantTitle(variant)}
            </Heading>
            <MembersTable owner={`${key}-${variant.title}`} label={`${name}: ${variant.title}${suffix}`} members={variant.members} />
          </div>
        );
      })}
      {typeEntry.otherVariants?.length ? (
        <p>
          Can also be{' '}
          {typeEntry.otherVariants.map((text, index) => (
            <span key={text}>
              {index > 0 ? ' or ' : ''}
              <code>{text}</code>
            </span>
          ))}
          .
        </p>
      ) : null}
      {typeEntry.inherits?.length ? (
        <p>
          <Muted>
            Also accepts the HTML attributes of{' '}
            {typeEntry.inherits.map((text, index) => (
              <span key={text}>
                {index > 0 ? ' and ' : ''}
                <code>{text}</code>
              </span>
            ))}{' '}
            (not listed here).
          </Muted>
        </p>
      ) : null}
    </section>
  );
}

export interface FunctionReferenceProps {
  /** A hook or function exported by `@formrail/core` or `@formrail/pro`. */
  name: string;
}

/** The reference of an exported hook or function: signature, description, parameters and return value. */
export function FunctionReference({ name }: FunctionReferenceProps) {
  const entry = entryOf(name);
  if (entry.kind !== 'function') throw new Error(`Type reference: "${name}" is a type, use <TypeReference>.`);
  const { ref, key, suffix } = useOccurrence(name);
  const id = slug(key);
  return (
    <section ref={ref} aria-labelledby={id} data-type-reference={name}>
      <Heading id={id} level="h3">
        <code>{name}</code>
      </Heading>
      <p>
        <Muted>
          Function · <code>{entry.package}</code>
        </Muted>
      </p>
      {entry.signatures.map((signature) => (
        <Pre key={signature.signature} className="sb-unstyled">
          <TypeText text={signature.signature} />
        </Pre>
      ))}
      <Description member={entry} />
      {entry.signatures.map((signature, index) => (
        <div key={signature.signature}>
          {signature.parameters.length > 0 ? (
            <MembersTable
              owner={entry.signatures.length > 1 ? `${key}-${index + 1}` : key}
              label={`${parametersLabel(name, index, entry.signatures.length)}${suffix}`}
              members={signature.parameters}
            />
          ) : null}
          <p>
            <strong>Returns</strong>{' '}
            <Code>
              <TypeText text={signature.returns.type} />
            </Code>
            {signature.returns.description ? ': ' : null}
          </p>
          {signature.returns.description ? <Markdown>{signature.returns.description}</Markdown> : null}
        </div>
      ))}
    </section>
  );
}
