'use client';

import { ArrowLeft } from 'lucide-react';
import { PlaygroundAvatar, VolumeBars } from '../DeviceChrome';
import { PLAYGROUND_PEOPLE } from '../mockData';
import DemoThread, { isNewClick } from './DemoThread';
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg" data-testid="playground-scene-clicks">
      {open ? (
        <>
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
        </>
      ) : (
        <>
          <div className="border-b border-hairline px-4 py-3">
            <h3 className="text-lg font-bold text-fg">Clicks</h3>
            <p className="text-xs text-fg-secondary">Chat with people you met in person</p>
          </div>
          <ul className="flex-1 overflow-auto">
            {connected.map((person) => {
              const thread = state.messages[person.id] ?? [];
                    const fresh = thread.length > 0 && isNewClick(thread);
                    const last = thread.at(-1);
                    const preview = fresh ? 'New Click · say hi' : last?.plan ? `📅 ${last.plan.title}` : last?.text ?? person.chatPreview;
              return (
                <li key={person.id} className="border-b border-hairline">
                  <button
                    type="button"
                    data-testid={`playground-clicks-chat-${person.id}`}
                    onClick={() => {
                      actions.setOpenChatId(person.id);
                      actions.setDashboardTab('chat');
                    }}
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
        </>
      )}
    </div>
  );
}
