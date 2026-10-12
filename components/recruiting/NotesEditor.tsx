"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveApplicationNotesAction } from "@/app/(admin)/admin/recruiting/actions";
import { Button, InlineNotice, TextArea } from "@/components/ds";
import { formatDateTime } from "@/lib/careers/recruiting";

const OFFLINE = "Couldn't reach Click. Your notes are still here; try again.";

/**
 * Private reviewer notes. Saves compare against the version this editor loaded, so two admins
 * never silently overwrite each other; on a clash your text stays until you take theirs.
 */
export function NotesEditor({
  applicationId,
  notes,
  notesUpdatedAt,
}: {
  applicationId: string;
  notes: string;
  notesUpdatedAt: string | null;
}) {
  const [draft, setDraft] = useState(notes);
  const [base, setBase] = useState({ notes, at: notesUpdatedAt });
  const [server, setServer] = useState({ notes, at: notesUpdatedAt });
  const [status, setStatus] = useState<{ tone: "error" | "conflict"; text: string } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const router = useRouter();

  // The page re-renders with the latest notes after any save; adopt them unless you're mid-edit.
  if (notes !== server.notes || notesUpdatedAt !== server.at) {
    setServer({ notes, at: notesUpdatedAt });
    if (draft === base.notes) {
      setDraft(notes);
      setBase({ notes, at: notesUpdatedAt });
    }
  }

  const dirty = draft !== base.notes;

  const save = () => {
    if (!dirty || inFlight.current) return;
    const text = draft;
    inFlight.current = true;
    startTransition(async () => {
      const result = await saveApplicationNotesAction(applicationId, text, base.at)
        .catch(() => ({ ok: false as const, error: OFFLINE }))
        .finally(() => {
          inFlight.current = false;
        });
      if (result.ok) {
        setBase({ notes: text, at: result.at });
        setStatus(null);
        setJustSaved(true);
        return;
      }
      const conflict = "conflict" in result && Boolean(result.conflict);
      setStatus({ tone: conflict ? "conflict" : "error", text: result.error });
      // Fetch the other admin's version so "Use latest" has it.
      if (conflict) router.refresh();
    });
  };

  const takeTheirs = () => {
    setDraft(server.notes);
    setBase(server);
    setStatus(null);
  };

  return (
    <div className="space-y-3">
      <TextArea
        label="Internal notes"
        value={draft}
        maxLength={10_000}
        placeholder="Only Click admins can see these."
        onChange={(e) => {
          setDraft(e.target.value);
          setJustSaved(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
        onBlur={() => {
          if (dirty && !status) save();
        }}
      />
      {status ? (
        <InlineNotice
          variant={status.tone === "conflict" ? "warning" : "destructive"}
          live
          action={
            status.tone === "conflict" && server.at !== base.at ? (
              <button type="button" onClick={takeTheirs} className="underline-offset-4 hover:underline">
                Use latest
              </button>
            ) : null
          }
        >
          {status.tone === "conflict"
            ? "Another admin saved these notes after you opened them. Your text is still here; copy anything you need, then use the latest."
            : status.text}
        </InlineNotice>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="type-meta min-w-0 text-fg-tertiary" role="status">
          {pending
            ? "Saving…"
            : dirty
              ? "Unsaved changes"
              : justSaved
                ? "Saved"
                : base.at
                  ? `Last edited ${formatDateTime(base.at)}`
                  : "No notes yet"}
        </p>
        <Button size="sm" variant="secondary" onClick={save} disabled={!dirty} loading={pending}>
          Save notes
        </Button>
      </div>
    </div>
  );
}
