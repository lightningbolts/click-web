import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EventMarkdownContentProps = {
  children: string;
  className?: string;
};

const INLINE_TOKEN_RE =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\[[^\]\n]+\]\([^\s)]+\)|\*[^*\n]+\*)/g;

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(href)) return href;
  return null;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const index = match.index ?? 0;
    const token = match[0];
    if (index > cursor) nodes.push(text.slice(cursor, index));

    const key = `${keyPrefix}-${tokenIndex++}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={key}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[0.9em] text-on-surface"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      const href = link ? safeHref(link[2]) : null;
      nodes.push(
        href ? (
          <a
            key={key}
            href={href}
            className="font-semibold text-primary underline-offset-2 hover:underline"
            {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {link?.[1]}
          </a>
        ) : (
          token
        ),
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    cursor = index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, index) => {
    const rendered = renderInline(line, `${keyPrefix}-line-${index}`);
    return index === lines.length - 1
      ? rendered
      : [...rendered, <br key={`${keyPrefix}-br-${index}`} />];
  });
}

export default function EventMarkdownContent({
  children,
  className,
}: EventMarkdownContentProps) {
  const source = children.trim();
  if (!source) return null;

  const blocks = source.split(/\n{2,}/);

  return (
    <div
      className={cn(
        "max-w-prose space-y-3 text-base leading-relaxed text-on-surface-variant",
        className,
      )}
      data-testid="event-description"
    >
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n");
        const key = `md-${blockIndex}`;

        const unordered = lines.every((line) => /^\s*[-+*]\s+/.test(line));
        if (unordered) {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {lines.map((line, index) => (
                <li key={`${key}-li-${index}`}>
                  {renderInline(line.replace(/^\s*[-+*]\s+/, ""), `${key}-li-${index}`)}
                </li>
              ))}
            </ul>
          );
        }

        const ordered = lines.every((line) => /^\s*\d+\.\s+/.test(line));
        if (ordered) {
          return (
            <ol key={key} className="list-decimal space-y-1 pl-5">
              {lines.map((line, index) => (
                <li key={`${key}-li-${index}`}>
                  {renderInline(line.replace(/^\s*\d+\.\s+/, ""), `${key}-li-${index}`)}
                </li>
              ))}
            </ol>
          );
        }

        const quoted = lines.every((line) => /^\s*>\s?/.test(line));
        if (quoted) {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-border-hard pl-4 text-on-surface-variant"
            >
              {renderLines(
                lines.map((line) => line.replace(/^\s*>\s?/, "")),
                key,
              )}
            </blockquote>
          );
        }

        if (lines.length === 1) {
          const heading = lines[0].match(/^(#{1,3})\s+(.+)$/);
          if (heading) {
            const level = heading[1].length;
            const body = renderInline(heading[2], `${key}-heading`);
            if (level === 1) {
              return (
                <h2 key={key} className="font-display text-2xl font-semibold leading-tight text-on-surface">
                  {body}
                </h2>
              );
            }
            if (level === 2) {
              return (
                <h3 key={key} className="text-lg font-bold leading-snug text-on-surface">
                  {body}
                </h3>
              );
            }
            return (
              <h4 key={key} className="text-base font-bold leading-snug text-on-surface">
                {body}
              </h4>
            );
          }
        }

        return <p key={key}>{renderLines(lines, key)}</p>;
      })}
    </div>
  );
}
