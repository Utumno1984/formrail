import { forwardRef, useEffect, useId, useMemo, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { textOf } from '../internal/react-nodes';
import { Title, type TitleLevel } from '../typography/Title';
import { composeRefs } from '../utils/compose-refs';
import { cn } from '../utils/cn';
import { accessibleText, useObjectPageContext } from './ObjectPageContext';
import { sectionBodyClass, sectionClass, sectionStyle, sectionTitleClass, sectionTitleFocusClass } from './object-page-styles';

export type ObjectPageSectionProps = Omit<HTMLAttributes<HTMLElement>, 'title' | 'id'> & {
  /**
   * The DOM id of the `<section>`, and what an anchor links to. Must be a valid id (no spaces) and
   * unique within the page; a duplicate is warned about in development.
   */
  id: string;
  /** Heading of the section. The region's accessible name is its text only (icons are left out). */
  title: ReactNode;
  /** The section's content (fields, tables, ...), under its heading. */
  children?: ReactNode;
};

/** A titled `<section>`: a `region` named by its heading, registered in the page in DOM order. */
export const ObjectPageSection = /* @__PURE__ */ forwardRef<HTMLElement, ObjectPageSectionProps>(function ObjectPageSection(
  { id, title, children, className, style, ...rest },
  ref,
) {
  const page = useObjectPageContext('ObjectPageSection');
  const key = useId();
  const titleId = `${key}-title`;
  const elementRef = useRef<HTMLElement | null>(null);
  const registerSection = page?.registerSection;
  const unregisterSection = page?.unregisterSection;
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  // Only a change trigger: what the registry stores is read from the rendered heading (see `readTitle`).
  const titleChange = textOf(title);
  const mergedRef = useMemo(() => composeRefs(ref, elementRef), [ref]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !registerSection || !unregisterSection) return undefined;
    registerSection(key, {
      id,
      element,
      readTitle: () => (titleRef.current ? accessibleText(titleRef.current) : ''),
      focusTitle: () => titleRef.current?.focus({ preventScroll: true }),
    });
    return () => unregisterSection(key);
  }, [key, id, titleChange, registerSection, unregisterSection]);

  const level = Math.min((page?.headingLevel ?? 1) + 1, 6) as TitleLevel;
  return (
    <section
      {...rest}
      id={id}
      ref={mergedRef}
      aria-labelledby={titleId}
      className={cn(sectionClass, className)}
      style={{ ...sectionStyle, ...style }}
    >
      <Title
        ref={titleRef}
        level={level}
        id={titleId}
        tabIndex={-1}
        className={cn(sectionTitleClass, sectionTitleFocusClass)}
      >
        {title}
      </Title>
      <div className={sectionBodyClass}>{children}</div>
    </section>
  );
});
