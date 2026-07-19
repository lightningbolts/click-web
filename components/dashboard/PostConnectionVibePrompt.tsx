"use client";

import { computeClickDropRevealTtlIso } from "@/lib/collaboration/clickDropReveal";

import { useRef, useState, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Loader2, MessageSquare, Sparkles, X } from "lucide-react";
import { uploadChatMediaBlob } from "@/lib/chat/chatMediaStorage";

const CATEGORIES = [
  { id: "atmosphere", label: "Atmosphere" },
  { id: "music", label: "Music / sound" },
  { id: "crowd", label: "Crowd energy" },
  { id: "service", label: "Service" },
  { id: "general", label: "Overall" },
] as const;

type Props = {
  connectionId: string;
  currentUserId: string;
  venueLabel: string;
  getAuthHeaders: () => Promise<HeadersInit>;
  onClose: () => void;
};

type CollaborationSessionResponse = {
  encounter_id?: unknown;
  collaboration_ttl?: unknown;
};

export default function PostConnectionVibePrompt({
  connectionId,
  currentUserId,
  venueLabel,
  getAuthHeaders,
  onClose,
}: Props) {
  const rollInputRef = useRef<HTMLInputElement>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [category, setCategory] = useState<string>("atmosphere");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [rollStatus, setRollStatus] = useState<"idle" | "opening" | "uploading" | "done" | "error">("idle");

  const skip = () => {
    try {
      sessionStorage.setItem(`click:vibe-skip:${connectionId}`, "1");
    } catch {
      /* ignore */
    }
    onClose();
  };

  const submit = async () => {
    if (rating === null && !message.trim()) return;
    setStatus("saving");
    try {
      const headers = await jsonHeaders();
      const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/venue-vibe`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...(rating !== null ? { rating } : {}),
          category,
          message: message.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("done");
      setTimeout(onClose, 900);
    } catch {
      setStatus("error");
    }
  };

  const jsonHeaders = async () => {
    const headers = new Headers(await getAuthHeaders());
    headers.set("Content-Type", "application/json");
    return headers;
  };

  const openCollaborationSession = async () => {
    const headers = await jsonHeaders();
    const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/collaboration-session`, {
      method: "POST",
      headers,
    });
    const body = (await res.json().catch(() => ({}))) as CollaborationSessionResponse;
    if (!res.ok) {
      throw new Error("Could not open Click Drop");
    }
    const encounterId = typeof body.encounter_id === "string" ? body.encounter_id.trim() : "";
    const collaborationTtl = typeof body.collaboration_ttl === "string" ? body.collaboration_ttl.trim() : "";
    if (!encounterId || !collaborationTtl) {
      throw new Error("Click Drop session was incomplete");
    }
    return { encounterId, collaborationTtl };
  };

  const openRollPicker = () => {
    if (rollStatus === "opening" || rollStatus === "uploading") return;
    rollInputRef.current?.click();
  };

  const onRollPhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setRollStatus("error");
      return;
    }

    setRollStatus("opening");
    try {
      const session = await openCollaborationSession();
      setRollStatus("uploading");
      const { publicUrl } = await uploadChatMediaBlob(currentUserId, file, file.type);
      const headers = await jsonHeaders();
      const messageRes = await fetch("/api/chat/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          connectionId,
          content: " ",
          message_type: "image",
          metadata: {
            media_url: publicUrl,
            original_mime_type: file.type || "image/jpeg",
            disposable_roll: true,
            encounter_id: session.encounterId,
            collaboration_ttl: computeClickDropRevealTtlIso(),
          },
        }),
      });
      if (!messageRes.ok) {
        throw new Error("Could not send Click Drop photo");
      }
      setRollStatus("done");
    } catch {
      setRollStatus("error");
    }
  };

  const rollBusy = rollStatus === "opening" || rollStatus === "uploading";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center"
        role="dialog"
        aria-labelledby="vibe-prompt-title"
        aria-modal="true"
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          className="relative w-full max-w-md rounded-2xl border border-border-hard bg-background p-5 shadow-violet-500/10"
        >
          <button
            type="button"
            onClick={skip}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-on-surface-variant hover:bg-white/10 hover:text-on-surface"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-amber-500/15 p-2">
              <Sparkles className="h-5 w-5 text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <h2 id="vibe-prompt-title" className="text-lg font-semibold text-on-surface">
                How was the vibe?
              </h2>
              <p className="text-xs text-on-surface-variant">
                Optional — helps venues improve (and stays aggregate in Business Insights).{" "}
                <span className="text-on-surface-variant">{venueLabel}</span>
              </p>
            </div>
          </div>

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
            1–5 at this place
          </p>
          <div className="mb-4 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                  rating === n
                    ? "bg-[#630ed4] text-on-surface"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-on-surface-variant">Focus</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === c.id
                    ? "bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/40"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mb-4 flex gap-2 rounded-xl border border-border-hard bg-black/20 px-3 py-2">
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="One line (optional)"
              rows={2}
              maxLength={500}
              className="min-h-[48px] w-full resize-none bg-transparent text-sm text-on-surface placeholder:text-outline outline-none"
            />
          </div>

          <input
            ref={rollInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            className="hidden"
            onChange={onRollPhotoSelected}
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={openRollPicker}
            disabled={rollBusy}
            className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-violet-400/30 bg-white/[0.07] px-4 py-3 text-left shadow-lg shadow-violet-500/10 transition-colors hover:border-violet-300/50 hover:bg-white/[0.1] disabled:cursor-wait disabled:opacity-70"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-400/15 text-primary">
              {rollBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-on-surface">Click Drop</span>
              <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">
                {rollStatus === "uploading"
                  ? "Dropping your photo into the shared roll..."
                  : rollStatus === "done"
                    ? "Captured to the roll."
                    : "Open the camera for a time-locked shared drop."}
              </span>
            </span>
          </motion.button>

          {status === "error" && (
            <p className="mb-3 text-sm text-red-700 dark:text-red-400">Couldn&apos;t save — try again later.</p>
          )}
          {status === "done" && (
            <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-300">Thanks — captured for the venue.</p>
          )}
          {rollStatus === "error" && (
            <p className="mb-3 text-sm text-red-700 dark:text-red-400">Couldn&apos;t open Click Drop — try again.</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={skip}
              className="flex-1 rounded-xl border border-border-hard py-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-white/25 hover:text-on-surface"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={status === "saving" || (rating === null && !message.trim())}
              className="flex-1 rounded-xl bg-[#630ed4] py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-[#732ee4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : "Share vibe"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
