"use client";

import { useState } from "react";
import type { PlaygroundActions, PlaygroundState } from "../types";

export default function GroupsPane({
  state,
  actions,
  phone = false,
}: {
  state: PlaygroundState;
  actions: PlaygroundActions;
  phone?: boolean;
}) {
  const [name, setName] = useState("Campus coffee");
  const [draft, setDraft] = useState("");
  const hubs = () => {
    actions.setHubMode("browse");
    actions.setDashboardTab("hubs");
    if (phone) actions.setScene("hubs");
  };
  return (
    <div className="space-y-4 overflow-auto" data-testid="playground-groups">
      {state.groupName ? (
        <section className="rounded-xl border border-hairline bg-surface p-4">
          <h4 className="font-bold">{state.groupName}</h4>
          <p className="mt-1 text-xs text-fg-secondary">
            You, Maya and Ymir · Verified group
          </p>
          <ul aria-label="Group messages" className="my-4 space-y-2">
            {state.groupMessages.map((text, i) => (
              <li
                key={i}
                className="rounded-xl bg-selection p-3 text-sm text-accent"
              >
                <strong>You</strong>
                <p className="break-words">{text}</p>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              actions.sendGroupMessage(draft);
              setDraft("");
            }}
            className="flex gap-2"
          >
            <input
              aria-label="Group message"
              className="min-w-0 flex-1 rounded-lg border border-hairline bg-bg px-3 py-2"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message the group…"
            />
            <button
              className="rounded-full bg-action px-3 text-sm text-on-action disabled:opacity-40"
              disabled={!draft.trim()}
            >
              Send
            </button>
          </form>
        </section>
      ) : (
        <form
          className="rounded-xl border border-hairline bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            actions.createGroup(name);
          }}
        >
          <h4 className="font-bold">Create Group Chat</h4>
          <p className="my-3 text-xs text-fg-secondary">
            Start a verified group with your Clicks. Demo members: Maya and
            Ymir.
          </p>
          <label className="block text-sm">
            Group name
            <input
              className="my-2 w-full rounded-lg border border-hairline bg-bg px-3 py-2"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            className="rounded-full bg-action px-4 py-2 text-sm text-on-action disabled:opacity-40"
            disabled={!name.trim()}
          >
            Create group
          </button>
        </form>
      )}
      <button
        type="button"
        onClick={hubs}
        className="w-full rounded-xl border border-hairline bg-surface p-4 text-left text-sm font-semibold"
      >
        {state.joinedHub ? state.hubName : "Join Community Hub"}
      </button>
    </div>
  );
}
