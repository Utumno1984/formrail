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
import { useContext } from 'react';
import { Controls, Description, DocsContext, DocsPage, DocsStory, Heading, Primary, Source, Subheading, Subtitle, Title } from '@storybook/addon-docs/blocks';
import type { PreparedStory } from 'storybook/internal/types';
import { EXAMPLE_TAG, SHOWCASE_SOURCE_TAG, controlsStory, exampleStylesheets, githubSource, selectPageStories, type SourceFile } from '../packages/core/src/internal/story-example';

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
        <span key={sheet}>
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
  if (!primary || (!isExample && !isShowcase)) return <DocsPage />;

  // The Controls' story: the Playground after an example (the same rule the props-table guard reads).
  const target = controlsStory([primary, ...selected]);
  const playground = target !== primary ? target : undefined;
  const others = selected.filter((s) => s !== playground);
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
      {files.length > 0 && <SourceFiles files={files} />}
    </>
  );
}
