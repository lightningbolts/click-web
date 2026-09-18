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
          <label htmlFor="event-description" className="text-sm font-semibold text-on-surface">
            Description
          </label>
          <p className="text-xs text-on-surface-variant">Markdown supported</p>
        </div>
        <div className="flex rounded-[8px] border border-border-hard bg-surface-container-low p-0.5">
          <button
            type="button"
            onClick={() => setMode("write")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-semibold transition-colors",
              mode === "write"
                ? "bg-surface text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface",
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
              "inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-semibold transition-colors",
              mode === "preview"
                ? "bg-surface text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface",
            )}
            aria-pressed={mode === "preview"}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-border-hard bg-surface">
        {mode === "write" ? (
          <>
            <div className="flex flex-wrap gap-1 border-b border-border-hard bg-surface-container-low px-2 py-1.5">
              {toolbar.map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-on-surface-variant transition-colors hover:bg-surface hover:text-on-surface"
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
              className="min-h-40 w-full resize-y bg-transparent px-3 py-3 text-sm leading-relaxed text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </>
        ) : (
          <div className="min-h-40 px-4 py-3">
            {value.trim() ? (
              <EventMarkdownContent>{value}</EventMarkdownContent>
            ) : (
              <p className="text-sm text-on-surface-variant">Nothing to preview yet.</p>
            )}
          </div>
        )}
        <div className="border-t border-border-hard px-3 py-1.5 text-right text-xs text-on-surface-variant">
          {value.length}/{maxLength}
        </div>
      </div>
    </div>
  );
}
