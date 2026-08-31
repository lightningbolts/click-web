'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Send } from 'lucide-react';
import { useState } from 'react';
import { PlaygroundAvatar, VolumeBars } from '../DeviceChrome';
import { PLAYGROUND_PEOPLE } from '../mockData';
import type { PlaygroundActions, PlaygroundState } from '../types';

export default function ChatPane({
  state,
  actions,
  compact = false,
}: {
  state: PlaygroundState;
  actions: PlaygroundActions;
  compact?: boolean;
}) {
  const connected = PLAYGROUND_PEOPLE.filter((p) => state.connectedIds.has(p.id));
  const open = connected.find((p) => p.id === state.openChatId) ?? null;
  const memory = open ? (state.memories[open.id] ?? open.memory) : undefined;
  const thread = open ? (state.messages[open.id] ?? []) : [];
  const [draft, setDraft] = useState('');
  const [listTab, setListTab] = useState<'active' | 'archived'>('active');

  const send = () => {
    if (!open || !draft.trim()) return;
    actions.sendMessage(open.id, draft.trim());
    setDraft('');
  };

  return (
    <div className={compact ? 'flex h-full min-h-0 flex-col' : undefined}>
    <AnimatePresence mode="wait" initial={false}>
      {open ? (
        <motion.div
          key={open.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={`flex flex-col rounded-[16px] border border-border-hard bg-surface ${
            compact ? 'min-h-0 flex-1' : 'min-h-[420px]'
          }`}
        >
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
        </motion.div>
      ) : (
        <motion.div
          key="inbox"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={compact ? 'flex h-full min-h-0 flex-col overflow-y-auto' : undefined}
        >
          <div className="mb-4">
            <h3 className="text-lg font-bold text-on-surface">{compact ? 'Clicks' : 'Messages'}</h3>
            <p className="text-xs text-on-surface-variant">Chat with your Clicks</p>
          </div>
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-2xl border border-border-hard bg-surface-container p-1.5">
            {(['active', 'archived'] as const).map((tab) => {
              const selected = listTab === tab;
              const count = tab === 'active' ? connected.length : 0;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setListTab(tab)}
                  className={`relative rounded-xl px-4 py-2 text-sm ${
                    selected ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {selected ? (
                    <motion.span
                      layoutId={compact ? 'playground-clicks-tabPill' : 'playground-chatListTabPill'}
                      className="absolute inset-0 rounded-xl border border-primary/35 bg-primary/15"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  ) : null}
                  <span className="relative z-10 flex items-center gap-2 capitalize">
                    {tab}
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px]">{count}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={listTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              {listTab === 'archived' ? (
                <p className="rounded-[16px] border border-border-hard bg-surface px-4 py-8 text-center text-sm text-on-surface-variant">
                  No archived chats in this demo.
                </p>
              ) : (
                <ul className="divide-y divide-border-hard overflow-hidden rounded-[16px] border border-border-hard bg-surface">
                  {connected.map((person) => {
                    const preview = state.messages[person.id]?.at(-1)?.text ?? person.chatPreview;
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => {
                            actions.setOpenChatId(person.id);
                            if (compact) actions.setDashboardTab('chat');
                          }}
                          data-testid={`playground-chat-${person.id}`}
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
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}
