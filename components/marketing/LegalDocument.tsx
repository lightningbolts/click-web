import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { PageHeader } from './PageHeader';

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type SectionProps = { title: string; children: ReactNode };

/** One section of a legal page; its title also feeds the contents list. */
export function LegalSection({ title, children }: SectionProps) {
  const id = slug(title);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="type-title-3 text-fg">
        {title}
      </h2>
      <div className="type-reading mt-3 flex flex-col gap-3 text-fg-secondary [&_a]:text-accent [&_a]:underline-offset-4 hover:[&_a]:underline [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/**
 * Privacy and Terms: header, a contents list (sticky beside the text on wide screens) built
 * from the sections' titles, then the sections at a reading measure.
 */
export function LegalDocument({
  id,
  title,
  updated,
  children,
  closing,
}: {
  id: string;
  title: string;
  updated: string;
  children: ReactNode;
  /** Sign-off paragraph under the last section. */
  closing: ReactNode;
}) {
  const titles = Children.toArray(children)
    .filter((c): c is ReactElement<SectionProps> => isValidElement<SectionProps>(c) && typeof c.props.title === 'string')
    .map((c) => c.props.title);

  return (
    <div className="container-page flex-1 pb-24">
      <PageHeader id={id} title={title} meta={`Last updated ${updated}`} />
      <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <p className="type-headline text-fg">On this page</p>
          <ol className="type-body mt-3 flex flex-col gap-2 border-l border-hairline pl-4">
            {titles.map((t) => (
              <li key={t}>
                <a href={`#${slug(t)}`} className="text-fg-secondary hover:text-fg">
                  {t}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex max-w-[68ch] flex-col gap-10">
          {children}
          <p className="type-body border-t border-hairline pt-8 text-fg-secondary [&_a]:text-accent">{closing}</p>
        </div>
      </div>
    </div>
  );
}
