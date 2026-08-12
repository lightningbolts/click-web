'use client';

import { ArrowLeft, Send } from 'lucide-react';
import { useState } from 'react';
import { PlaygroundAvatar, VolumeBars } from '../DeviceChrome';
import { PLAYGROUND_PEOPLE } from '../mockData';
import type { PlaygroundActions, PlaygroundState } from '../types';

export default function ClicksScene({
  state,
  actions,
}: {
  state: PlaygroundState;
  actions: PlaygroundActions;
}) {
  const connected = PLAYGROUND_PEOPLE.filter((p) => state.connectedIds.has(p.id));
  const open = connected.find((p) => p.id === state.openChatId) ?? null;
  const memory = open ? (state.memories[open.id] ?? open.memory) : undefined;
  const thread = open ? (state.messages[open.id] ?? []) : [];
  const [draft, setDraft] = useState('');

  const send = () => {
    if (!open || !draft.trim()) return;
    actions.sendMessage(open.id, draft.trim());
    setDraft('');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background" data-testid="playground-scene-clicks">
      {open ? (
        <>
          <div className="flex items-center gap-3 border-b border-border-hard px-3 py-3">
            <button
              type="button"
              aria-label="Back to messages"
              onClick={() => actions.setOpenChatId(null)}
              className="rounded-[8px] border border-border-hard p-1.5 text-on-surface-variant"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <PlaygroundAvatar initials={open.initials} size="sm" online={open.online} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface">{open.name}</p>
              {memory ? (
                <p className="flex items-center gap-1.5 truncate text-[11px] text-on-surface-variant">
                  {memory.label} · {memory.place} <VolumeBars count={memory.volume} />
                </p>
              ) : null}
            </div>
          </div>
          <ul className="flex flex-1 flex-col gap-2 overflow-auto px-3 py-3">
            {thread.map((msg) => (
              <li
                key={msg.id}
                className={`max-w-[80%] rounded-[16px] px-3 py-2 text-sm ${
                  msg.from === 'you'
                    ? 'ml-auto bg-primary text-on-primary'
                    : 'border border-border-hard bg-surface-container text-on-surface'
                }`}
              >
                <p>{msg.text}</p>
                <p className={`mt-1 text-[10px] ${msg.from === 'you' ? 'text-on-primary/70' : 'text-on-surface-variant'}`}>
                  {msg.time}
                </p>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2 border-t border-border-hard p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${open.name.split(' ')[0]}…`}
              className="fc-input min-w-0 flex-1 px-3 py-2"
              aria-label="Message"
            />
            <button type="submit" className="fc-btn-primary px-3 py-2" aria-label="Send message">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="border-b border-border-hard px-4 py-3">
            <h3 className="text-lg font-bold text-on-surface">Clicks</h3>
            <p className="text-xs text-on-surface-variant">Chat with people you met in person</p>
          </div>
          <ul className="flex-1 overflow-auto">
            {connected.map((person) => {
              const preview = state.messages[person.id]?.at(-1)?.text ?? person.chatPreview;
              return (
                <li key={person.id} className="border-b border-border-hard">
                  <button
                    type="button"
                    data-testid={`playground-clicks-chat-${person.id}`}
                    onClick={() => {
                      actions.setOpenChatId(person.id);
                      actions.setDashboardTab('chat');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-container"
                  >
                    <PlaygroundAvatar initials={person.initials} online={person.online} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-on-surface">{person.name}</p>
                        <span className="text-[11px] text-on-surface-variant">{person.chatTime}</span>
                      </div>
                      <p className="truncate text-xs text-on-surface-variant">{preview}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
