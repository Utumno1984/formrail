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
import { EXAMPLE_TAG, SHOWCASE_SOURCE_TAG, controlsStory, githubSource, type SourceFile } from '../packages/core/src/internal/story-example';

function SourceFiles({ files }: { files: SourceFile[] }) {
  return (
    <>
      <Heading>Source</Heading>
      {files.map((file) => (
        <section key={file.path} aria-label={file.path}>
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
  const { componentStories } = useContext(DocsContext);
  // The same selection as Storybook's `Primary` / `Stories` blocks: autodocs stories, no `mount` stories.
  const all = componentStories();
  const stories = all.some((s) => s.tags?.includes('autodocs')) ? all.filter((s) => s.tags?.includes('autodocs') && !s.usesMount) : all;
  const [primary, ...rest] = stories;
  const isExample = !!primary?.tags?.includes(EXAMPLE_TAG);
  const isShowcase = !!primary?.tags?.includes(SHOWCASE_SOURCE_TAG);
  if (!primary || (!isExample && !isShowcase)) return <DocsPage />;

  // The Controls' story: the Playground after an example (the same rule the props-table guard reads).
  const target = controlsStory(stories);
  const playground = target !== primary ? target : undefined;
  const others = rest.filter((s) => s !== playground);
  const files = (primary.parameters?.docs as { sourceFiles?: SourceFile[] } | undefined)?.sourceFiles ?? [];
  return (
    <>
      <Title />
      <Subtitle />
      <Description of="meta" />
      <Primary />
      {playground ? (
        <>
          <DocsStory of={playground.moduleExport} expanded __forceInitialArgs />
          <Controls of={playground.moduleExport} />
        </>
      ) : (
        <Controls />
      )}
      {others.length > 0 && <Heading>Stories</Heading>}
      {others.map((story) => (
        <DocsStory key={story.id} of={story.moduleExport} expanded __forceInitialArgs />
      ))}
      {files.length > 0 && <SourceFiles files={files} />}
    </>
  );
}
