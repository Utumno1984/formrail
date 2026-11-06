import { forwardRef, useCallback, type HTMLAttributes, type ReactNode } from 'react';
import { hasContent } from '../internal/react-nodes';
import { Text } from '../typography/Text';
import { Title } from '../typography/Title';
import { cn } from '../utils/cn';
import { useObjectPageContext } from './ObjectPageContext';
import {
  headerActionsClass,
  headerClass,
  headerIdentityClass,
  headerSubtitleClass,
  headerTitleClass,
  headerTitleFocusClass,
  headerTitleRowClass,
} from './object-page-styles';

export type ObjectPageHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> & {
  /** Identity of the object. Wraps when long, never truncated. */
  title: ReactNode;
  /** Secondary line under the title (an id, a date, a customer). Wraps when long, never truncated. */
  subtitle?: ReactNode;
  /** Next to the title (a status badge, say). */
  status?: ReactNode;
  /** Buttons for the object (below the title on a narrow screen). */
  actions?: ReactNode;
};

/** Identity of the object (title, subtitle, status) and its actions. Scrolls with the content. */
export const ObjectPageHeader = /* @__PURE__ */ forwardRef<HTMLDivElement, ObjectPageHeaderProps>(function ObjectPageHeader(
  { title, subtitle, status, actions, className, ...rest },
  ref,
) {
  const page = useObjectPageContext('ObjectPageHeader');
  const registerHeaderTitle = page?.registerHeaderTitle;
  const titleRef = useCallback((node: HTMLHeadingElement | null) => registerHeaderTitle?.(node), [registerHeaderTitle]);
  return (
    <div {...rest} ref={ref} className={cn(headerClass, className)}>
      <div className={headerIdentityClass}>
        <div className={headerTitleRowClass}>
          <Title ref={titleRef} level={page?.headingLevel ?? 1} tabIndex={-1} className={cn(headerTitleClass, headerTitleFocusClass)}>
            {title}
          </Title>
          {hasContent(status) ? <div>{status}</div> : null}
        </div>
        {hasContent(subtitle) ? <Text className={headerSubtitleClass}>{subtitle}</Text> : null}
      </div>
      {hasContent(actions) ? <div className={headerActionsClass}>{actions}</div> : null}
    </div>
  );
});
