"use client";

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
      throw new Error("Could not open Disposable Roll");
    }
    const encounterId = typeof body.encounter_id === "string" ? body.encounter_id.trim() : "";
    const collaborationTtl = typeof body.collaboration_ttl === "string" ? body.collaboration_ttl.trim() : "";
    if (!encounterId || !collaborationTtl) {
      throw new Error("Disposable Roll session was incomplete");
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
            collaboration_ttl: session.collaborationTtl,
          },
        }),
      });
      if (!messageRes.ok) {
        throw new Error("Could not send Disposable Roll photo");
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
          className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl shadow-violet-500/10"
        >
          <button
            type="button"
            onClick={skip}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-amber-500/15 p-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 id="vibe-prompt-title" className="text-lg font-semibold text-white">
                How was the vibe?
              </h2>
              <p className="text-xs text-zinc-500">
                Optional — helps venues improve (and stays aggregate in Business Insights).{" "}
                <span className="text-zinc-400">{venueLabel}</span>
              </p>
            </div>
          </div>

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
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
                    ? "bg-[#8338EC] text-white"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Focus</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === c.id
                    ? "bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/40"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mb-4 flex gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="One line (optional)"
              rows={2}
              maxLength={500}
              className="min-h-[48px] w-full resize-none bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
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
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-400/15 text-violet-200">
              {rollBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">Disposable Roll</span>
              <span className="mt-0.5 block text-xs leading-5 text-zinc-400">
                {rollStatus === "uploading"
                  ? "Dropping your photo into the shared roll..."
                  : rollStatus === "done"
                    ? "Captured to the roll."
                    : "Open the camera for a time-locked shared drop."}
              </span>
            </span>
          </motion.button>

          {status === "error" && (
            <p className="mb-3 text-sm text-red-400">Couldn&apos;t save — try again later.</p>
          )}
          {status === "done" && (
            <p className="mb-3 text-sm text-emerald-400">Thanks — captured for the venue.</p>
          )}
          {rollStatus === "error" && (
            <p className="mb-3 text-sm text-red-400">Couldn&apos;t open Disposable Roll — try again.</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={skip}
              className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-medium text-zinc-400 transition-colors hover:border-white/25 hover:text-white"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={status === "saving" || (rating === null && !message.trim())}
              className="flex-1 rounded-xl bg-[#8338EC] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#9d4eff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : "Share vibe"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
