"use client";

import { useRef, useState } from "react";
import {
  Bold,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  Pencil,
  Quote,
} from "lucide-react";
import EventMarkdownContent from "@/components/events/EventMarkdownContent";
import { cn } from "@/lib/cn";

type EventMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  name?: string;
};

type EditMode = "write" | "preview";

export default function EventMarkdownEditor({
  value,
  onChange,
  maxLength = 10000,
  name = "description",
}: EventMarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<EditMode>("write");

  const replaceSelection = (
    before: string,
    after = "",
    placeholder = "",
    linePrefix = false,
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    let next: string;
    let selectionStart: number;
    let selectionEnd: number;

    if (linePrefix) {
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const lineEndIndex = value.indexOf("\n", end);
      const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
      const lines = value.slice(lineStart, lineEnd).split("\n");
      const replacement = lines.map((line) => `${before}${line}`).join("\n");
      next = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
      selectionStart = lineStart;
      selectionEnd = lineStart + replacement.length;
    } else {
      const replacement = `${before}${selected}${after}`;
      next = value.slice(0, start) + replacement + value.slice(end);
      selectionStart = start + before.length;
      selectionEnd = selectionStart + selected.length;
    }

    if (next.length > maxLength) return;
    onChange(next);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const toolbar = [
    {
      label: "Bold",
      icon: Bold,
      onClick: () => replaceSelection("**", "**", "bold text"),
    },
    {
      label: "Italic",
      icon: Italic,
      onClick: () => replaceSelection("*", "*", "italic text"),
    },
    {
      label: "Heading",
      icon: Heading2,
      onClick: () => replaceSelection("## ", "", "", true),
    },
    {
      label: "Link",
      icon: Link2,
      onClick: () => replaceSelection("[", "](https://)", "link text"),
    },
    {
      label: "List",
      icon: List,
      onClick: () => replaceSelection("- ", "", "", true),
    },
    {
      label: "Quote",
      icon: Quote,
      onClick: () => replaceSelection("> ", "", "", true),
    },
  ] as const;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div>
          <label htmlFor="event-description" className="type-body-strong text-fg">
            Description
          </label>
          <p className="type-meta text-fg-secondary">Markdown supported</p>
        </div>
        <div className="flex rounded-sm border border-hairline bg-fill-subtle p-0.5">
          <button
            type="button"
            onClick={() => setMode("write")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 type-meta font-semibold transition-colors",
              mode === "write"
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-secondary hover:text-fg",
            )}
            aria-pressed={mode === "write"}
          >
            <Pencil className="h-3.5 w-3.5" />
            Write
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 type-meta font-semibold transition-colors",
              mode === "preview"
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-secondary hover:text-fg",
            )}
            aria-pressed={mode === "preview"}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-hairline bg-surface">
        {mode === "write" ? (
          <>
            <div className="flex flex-wrap gap-1 border-b border-hairline bg-fill-subtle px-2 py-1.5">
              {toolbar.map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-fg-secondary transition-colors hover:bg-surface-raised hover:text-fg"
                  aria-label={label}
                  title={label}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              id="event-description"
              name={name}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              maxLength={maxLength}
              rows={7}
              placeholder={"What should people know?\n\nUse **bold**, *italic*, lists, headings, links, and quotes."}
              className="min-h-40 w-full resize-y bg-transparent px-3 py-3 type-body text-fg outline-none placeholder:text-fg-secondary"
            />
          </>
        ) : (
          <div className="min-h-40 px-4 py-3">
            {value.trim() ? (
              <EventMarkdownContent>{value}</EventMarkdownContent>
            ) : (
              <p className="type-body text-fg-secondary">Nothing to preview yet.</p>
            )}
          </div>
        )}
        <div className="border-t border-hairline px-3 py-1.5 text-right type-meta text-fg-secondary">
          {value.length}/{maxLength}
        </div>
      </div>
    </div>
  );
}
