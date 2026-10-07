import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { withoutLeadingTitle } from "@/lib/events/eventMetadata";

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

function renderInline(text: string, keyPrefix: string, links = true): ReactNode[] {
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
          className="rounded-sm bg-surface-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      const href = link && links ? safeHref(link[2]) : null;
      nodes.push(
        href ? (
          <a
            key={key}
            href={href}
            className="font-semibold text-accent underline-offset-2 hover:underline"
            {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {link?.[1]}
          </a>
        ) : (
          (links ? token : link?.[1] ?? token)
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

function lineKind(line: string): "ul" | "ol" | "text" {
  if (/^\s*[-+*]\s+/.test(line)) return "ul";
  if (/^\s*\d+\.\s+/.test(line)) return "ol";
  return "text";
}

/** "**What to bring**" followed directly by bullets: split a block where lists start or stop. */
function splitListRuns(block: string): string[] {
  const runs: string[][] = [];
  let prev: string | null = null;
  for (const line of block.split("\n")) {
    const kind = lineKind(line);
    if (kind !== prev) runs.push([]);
    runs[runs.length - 1].push(line);
    prev = kind;
  }
  return runs.map((run) => run.join("\n"));
}

export default function EventMarkdownContent({
  children,
  className,
}: EventMarkdownContentProps) {
  const source = children.trim();
  if (!source) return null;

  const blocks = source.split(/\n{2,}/).flatMap(splitListRuns);

  return (
    <div
      className={cn(
        "type-reading max-w-[68ch] space-y-3 text-fg",
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
              {lines.map((line, index) => {
                const marker = Number.parseInt(line.trimStart().split(".", 1)[0] ?? "", 10);
                return (
                  <li key={`${key}-li-${index}`} value={Number.isFinite(marker) ? marker : undefined}>
                    {renderInline(line.replace(/^\s*\d+\.\s+/, ""), `${key}-li-${index}`)}
                  </li>
                );
              })}
            </ol>
          );
        }

        const quoted = lines.every((line) => /^\s*>\s?/.test(line));
        if (quoted) {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-hairline pl-4 text-fg-secondary"
            >
              {renderLines(
                lines.map((line) => line.replace(/^\s*>\s?/, "")),
                key,
              )}
            </blockquote>
          );
        }

        const heading = lines[0]?.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          const body = renderInline(heading[2], `${key}-heading`);
          const headingNode =
            level === 1 ? (
              <h2 className="type-title-3 text-fg">
                {body}
              </h2>
            ) : level === 2 ? (
              <h3 className="type-headline text-fg">{body}</h3>
            ) : (
              <h4 className="type-body-strong text-fg">{body}</h4>
            );
          const remainder = lines.slice(1);
          return (
            <div key={key} className="space-y-2">
              {headingNode}
              {remainder.length > 0 ? <p>{renderLines(remainder, `${key}-body`)}</p> : null}
            </div>
          );
        }

        return <p key={key}>{renderLines(lines, key)}</p>;
      })}
    </div>
  );
}

/**
 * One flowing line of a description for clamped previews (map panel, chat cards): inline
 * formatting kept, block syntax (headings, lists, quotes) flattened, links as plain text since
 * previews usually sit inside a link. Pass `title` to drop a leading heading that repeats it.
 */
export function EventMarkdownPreview({
  children,
  title,
  className,
}: {
  children: string;
  title?: string | null;
  className?: string;
}) {
  const flat = withoutLeadingTitle(children.trim(), title)
    .replace(/^\s{0,3}#{1,3}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-+*]|\d+\.)\s+/gm, "")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
  if (!flat) return null;
  return <p className={className}>{renderInline(flat, "md-preview", false)}</p>;
}
