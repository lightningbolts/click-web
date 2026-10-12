import type { ReactNode } from 'react';

/**
 * Title block for the public pages (About, Careers, Enterprise, legal). Left-aligned under the
 * logo like the app's pages; `id` doubles as the heading's test id.
 */
export function PageHeader({
  id,
  title,
  lead,
  meta,
  children,
}: {
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  /** Small line under the title, e.g. "Last updated …". */
  meta?: ReactNode;
  /** Actions under the lead. */
  children?: ReactNode;
}) {
  return (
    <header className="pb-10 pt-12 md:pb-16 md:pt-20">
      <h1 id={id} data-testid={id} className="type-display max-w-[22ch] text-fg">
        {title}
      </h1>
      {meta ? <p className="type-meta mt-3 text-fg-secondary">{meta}</p> : null}
      {lead ? <p className="type-reading mt-5 max-w-[62ch] text-fg-secondary">{lead}</p> : null}
      {children ? <div className="mt-8">{children}</div> : null}
    </header>
  );
}
