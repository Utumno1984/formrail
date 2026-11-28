// The Docs page template (ticket #403), set as `parameters.docs.page` in preview.ts.
//
// A page whose first story is a copy-paste example (tag `example`, see
// packages/core/src/internal/story-example.ts) is laid out as:
//   1. title, subtitle and the component's description;
//   2. the example, as the primary story: its "Show code" is the `*.example.tsx` file, verbatim;
//   3. the Playground (the story tagged `playground`) with the page's Controls attached to IT: Storybook's
//      own template attaches them to the primary story, and an example reads no args, so its controls
//      would change nothing;
//   4. the other stories.
// A showcase page (first story tagged `showcase-source`) also lists its main source files, each with its
// GitHub link. Every other page renders exactly Storybook's own template (`DocsPage`), untouched.
//
// Ticket #624: whatever the page, its `use-case` stories (domain examples, see story-example.ts) are NOT in
// the lists above: they come last, after every other story, under "Examples" (Free) or "Use cases" (Pro, title
// `Pro/...`), with a fixed introductory sentence. A page without `use-case` stories renders as before. A page
// without a copy-paste example that has use cases renders Storybook's own template on the page WITHOUT them
// (`NeutralDocsPage`), then the section: adding a use case never changes the neutral part of a page.
import { useContext, useMemo, type ComponentType, type PropsWithChildren } from 'react';
import { Controls, Description, DocsContext, DocsPage, DocsStory, Heading, Primary, Source, Stories, Subheading, Subtitle, Title, useOf } from '@storybook/addon-docs/blocks';
import type { PreparedStory } from 'storybook/internal/types';
import {
  EXAMPLE_TAG,
  SHOWCASE_SOURCE_TAG,
  USE_CASES_INTRO,
  USE_CASE_TAG,
  EDGE_CASES_HEADING,
  EDGE_CASES_INTRO,
  controlsStory,
  exampleStylesheets,
  planEdgeCasesSection,
  githubSource,
  isSingleNeutralStory,
  selectPageStories,
  planUseCasesSection,
  sectionHeadingOf,
  type SourceFile,
} from '../packages/core/src/internal/story-example';

/**
 * The stylesheets the pasted example needs (ticket #403; the Pro ones, #447): the core one, then the Pro one
 * when the example imports `@formrail/pro`, one `<code>` per import line, in import order.
 */
function StylesReminder({ sheets }: { sheets: string[] }) {
  const line = (sheet: string) => <code key={sheet}>import &apos;{sheet}&apos;;</code>;
  if (sheets.length === 1) return <p data-styles-reminder>To use the example in your app, import the stylesheet once: {line(sheets[0]!)}</p>;
  return (
    <p data-styles-reminder>
      To use the example in your app, import the stylesheets once, in this order:{' '}
      {sheets.map((sheet, index) => (
        // fontSize inherit: Storybook's Docs stylesheet sets its own size on a bare span (16px inside a 14px paragraph, #610).
        <span key={sheet} style={{ fontSize: 'inherit' }}>
          {index > 0 && ', then '}
          {line(sheet)}
        </span>
      ))}
    </p>
  );
}

function SourceFiles({ files }: { files: SourceFile[] }) {
  return (
    <>
      <Heading>Source</Heading>
      {/* min-width 0 / overflow-x auto: a long line scrolls inside its own block and never widens the page. */}
      {files.map((file) => (
        <section key={file.path} aria-label={file.path} style={{ minWidth: 0, maxWidth: '100%', overflowX: 'auto' }}>
          <Subheading>{file.path}</Subheading>
          <p>
            {file.note} <a href={githubSource(file.path)}>View on GitHub</a>
          </p>
          <Source code={file.code} language="tsx" />
        </section>
      ))}
    </>
  );
}

// Storybook's `Heading` passes its other props to the `<h2>` after its own slug id, so `id` sets the id the
// section's `aria-labelledby` points to (its props type only declares `disableAnchor`).
const HeadingWithId = Heading as ComponentType<PropsWithChildren<{ id: string }>>;

/** The section of the domain examples (ticket #624): last on the page, after every neutral story. */
function UseCases({ stories, title }: { stories: PreparedStory[]; title: string }) {
  if (stories.length === 0) return null;
  const heading = sectionHeadingOf(title);
  const headingId = heading === 'Use cases' ? 'use-cases' : 'examples';
  return (
    <section data-use-cases aria-labelledby={headingId}>
      <HeadingWithId id={headingId}>{heading}</HeadingWithId>
      <p data-use-cases-intro>{USE_CASES_INTRO}</p>
      {stories.map((story) => (
        <DocsStory key={story.id} of={story.moduleExport} expanded __forceInitialArgs />
      ))}
    </section>
  );
}

/**
 * The section of the edge-case stories (ticket #723): after the component's other stories, before the domain
 * examples, which stay last (#624). Only on a page that opens with a copy-paste example: the guard of the order
 * (e2e/docs-story-order.spec.ts) fails on an `edge-case` or `happy-path` tag anywhere else.
 */
function EdgeCases({ stories }: { stories: PreparedStory[] }) {
  if (stories.length === 0) return null;
  return (
    <section data-edge-cases aria-labelledby="edge-cases">
      <HeadingWithId id="edge-cases">{EDGE_CASES_HEADING}</HeadingWithId>
      <p data-edge-cases-intro>{EDGE_CASES_INTRO}</p>
      {stories.map((story) => (
        <DocsStory key={story.id} of={story.moduleExport} expanded __forceInitialArgs />
      ))}
    </section>
  );
}

/**
 * Storybook's own template (`DocsPage` of @storybook/addon-docs: the same blocks, in the same order) on the
 * page WITHOUT its `use-case` stories: the blocks read `componentStories()` from a context that leaves them out
 * (`Primary`, `Controls`, `Stories` with the primary included and its own heading), and the single-story rule
 * counts the CSF file without them. So a page that gains a use case keeps exactly its neutral part.
 */
function NeutralDocsPage() {
  const context = useContext(DocsContext);
  // Object.create: the context is a class instance (methods on its prototype, state in its fields); only
  // `componentStories` changes, everything else is read through the prototype. This works because DocsContext
  // (@storybook/addon-docs 10.6.3, verified) has no `#private` fields: a method called on this object would throw
  // a TypeError on a private field read through the wrapper. On a Storybook upgrade the e2e of the neutral part
  // (e2e/docs-use-cases.spec.ts) fails if that stops being true; the use-case guard also keeps the id of the
  // section's heading unique on the page (use-case-guard.ts).
  const neutral = useMemo(() => {
    const stories = context.componentStories().filter((story) => !story.tags?.includes(USE_CASE_TAG));
    return Object.create(context, { componentStories: { value: () => stories } }) as typeof context;
  }, [context]);
  const { csfFile } = useOf('meta', ['meta']);
  const isSingleStory = isSingleNeutralStory(Object.values(csfFile.stories));
  return (
    <DocsContext.Provider value={neutral}>
      <Title />
      <Subtitle />
      <Description of="meta" />
      {isSingleStory ? <Description of="story" /> : null}
      <Primary />
      <Controls />
      {isSingleStory ? null : <Stories />}
    </DocsContext.Provider>
  );
}

export function FormrailDocsPage() {
  const { componentStories, projectAnnotations, getStoryContext, filterByAutodocs } = useContext(DocsContext);
  // The same selection as Storybook's `Primary` / `Stories` blocks, including `parameters.docs.stories.filter`
  // (tags excluded from the Docs) and `filterByAutodocs`.
  const configured = projectAnnotations.parameters?.docs?.stories?.filter as ((story: PreparedStory, context: unknown) => boolean) | undefined;
  const { primary, others: selected } = selectPageStories(componentStories(), {
    filter: configured && ((story) => configured(story, getStoryContext(story))),
    filterByAutodocs,
  });
  const isExample = !!primary?.tags?.includes(EXAMPLE_TAG);
  const isShowcase = !!primary?.tags?.includes(SHOWCASE_SOURCE_TAG);
  if (!primary) return <DocsPage />;
  // Use cases leave the page's own lists and go to their section; a page of fixtures (`internal`) keeps them all.
  // A page with no section (no use case, or only hidden `internal` variants of one) is not touched.
  const { neutral, section } = planUseCasesSection(primary.title, selected, !primary.tags?.includes('internal'));
  const useCases = section?.stories ?? [];
  if (!isExample && !isShowcase) {
    if (!section) return <DocsPage />;
    return (
      <>
        <NeutralDocsPage />
        <UseCases stories={useCases} title={primary.title} />
      </>
    );
  }

  // The Controls' story: the Playground after an example (the same rule the props-table guard reads).
  const target = controlsStory([primary, ...neutral]);
  const playground = target !== primary ? target : undefined;
  // Ticket #723: the happy path heads the "Stories" list, the edge cases leave it for their own section.
  const { main: others, edgeCases } = planEdgeCasesSection(neutral.filter((s) => s !== playground));
  const files = (primary.parameters?.docs as { sourceFiles?: SourceFile[] } | undefined)?.sourceFiles ?? [];
  return (
    <>
      <Title />
      <Subtitle />
      <Description of="meta" />
      <Primary />
      {/* Ticket #403: the one thing the pasted file does not say (a page-level line, not inside the example). */}
      {isExample && <StylesReminder sheets={exampleStylesheets(String((primary.parameters?.docs as { source?: { code?: unknown } } | undefined)?.source?.code ?? ''))} />}
      {playground ? (
        <>
          <DocsStory of={playground.moduleExport} expanded __forceInitialArgs />
          <Controls of={playground.moduleExport} />
        </>
      ) : (
        <Controls />
      )}
      {others.length > 0 && (
        <>
          <Heading>Stories</Heading>
          {/* Ticket #403: one note for every demo story of the page (they render through demo wrappers). */}
          {isExample && (
            <p data-demo-code-note>
              Demo code: the &quot;Show code&quot; of the stories below prints each demo as written for this page (its
              wrappers, fixtures and live Controls), not code to paste. Start from the example at the top of the page.
            </p>
          )}
        </>
      )}
      {others.map((story) => (
        <DocsStory key={story.id} of={story.moduleExport} expanded __forceInitialArgs />
      ))}
      <EdgeCases stories={edgeCases} />
      {files.length > 0 && <SourceFiles files={files} />}
      <UseCases stories={useCases} title={primary.title} />
    </>
  );
}
