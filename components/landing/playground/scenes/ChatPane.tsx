'use client';

import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { PlaygroundAvatar, VolumeBars } from '../DeviceChrome';
import { PLAYGROUND_PEOPLE } from '../mockData';
import DemoThread, { isNewClick } from './DemoThread';
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
  const [listTab, setListTab] = useState<'active' | 'archived'>('active');

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
          className={`flex flex-col rounded-[16px] border border-hairline bg-surface ${
            compact ? 'min-h-0 flex-1' : 'min-h-[420px]'
          }`}
        >
          <div className="flex items-center gap-3 border-b border-hairline px-3 py-3">
            <button
              type="button"
              aria-label="Back to messages"
              onClick={() => actions.setOpenChatId(null)}
              className="rounded-[8px] border border-hairline p-1.5 text-fg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <PlaygroundAvatar initials={open.initials} size="sm" online={open.online} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{open.name}</p>
              {memory ? (
                <p className="flex items-center gap-1.5 truncate text-[11px] text-fg-secondary">
                  {memory.label} · {memory.place} <VolumeBars count={memory.volume} />
                </p>
              ) : null}
            </div>
          </div>
          <DemoThread person={open} memory={memory} thread={thread} actions={actions} />
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
            <h3 className="text-lg font-bold text-fg">{compact ? 'Clicks' : 'Messages'}</h3>
            <p className="text-xs text-fg-secondary">Chat with your Clicks</p>
          </div>
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-2xl border border-hairline bg-surface-raised p-1.5">
            {(['active', 'archived'] as const).map((tab) => {
              const selected = listTab === tab;
              const count = tab === 'active' ? connected.length : 0;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setListTab(tab)}
                  className={`relative rounded-xl px-4 py-2 text-sm ${
                    selected ? 'text-fg' : 'text-fg-secondary hover:text-fg'
                  }`}
                >
                  {selected ? (
                    <motion.span
                      layoutId={compact ? 'playground-clicks-tabPill' : 'playground-chatListTabPill'}
                      className="absolute inset-0 rounded-xl border border-action/35 bg-action/15"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  ) : null}
                  <span className="relative z-10 flex items-center gap-2 capitalize">
                    {tab}
                    <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px]">{count}</span>
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
                <p className="rounded-[16px] border border-hairline bg-surface px-4 py-8 text-center text-sm text-fg-secondary">
                  No archived chats in this demo.
                </p>
              ) : (
                <ul className="divide-y divide-hairline overflow-hidden rounded-[16px] border border-hairline bg-surface">
                  {connected.map((person) => {
                    const thread = state.messages[person.id] ?? [];
                    const fresh = thread.length > 0 && isNewClick(thread);
                    const last = thread.at(-1);
                    const preview = fresh ? 'New Click · say hi' : last?.plan ? `📅 ${last.plan.title}` : last?.text ?? person.chatPreview;
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => {
                            actions.setOpenChatId(person.id);
                            if (compact) actions.setDashboardTab('chat');
                          }}
                          data-testid={`playground-chat-${person.id}`}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-raised"
                        >
                          <PlaygroundAvatar initials={person.initials} online={person.online} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-fg">{person.name}</p>
                              {fresh ? (
                          <span className="rounded-full bg-selection px-1.5 py-0.5 text-[10px] font-bold text-accent">48h left</span>
                        ) : (
                          <span className="text-[11px] text-fg-secondary">{person.chatTime}</span>
                        )}
                            </div>
                            <p className={`truncate text-xs ${fresh ? 'font-semibold text-accent' : 'text-fg-secondary'}`}>{preview}</p>
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
