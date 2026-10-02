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
          <DemoThread person={open} memory={memory} thread={thread} actions={actions} />
        </>
      ) : (
        <>
          <div className="border-b border-border-hard px-4 py-3">
            <h3 className="text-lg font-bold text-on-surface">Clicks</h3>
            <p className="text-xs text-on-surface-variant">Chat with people you met in person</p>
          </div>
          <ul className="flex-1 overflow-auto">
            {connected.map((person) => {
              const thread = state.messages[person.id] ?? [];
                    const fresh = thread.length > 0 && isNewClick(thread);
                    const last = thread.at(-1);
                    const preview = fresh ? 'New Click · say hi' : last?.plan ? `📅 ${last.plan.title}` : last?.text ?? person.chatPreview;
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
                        {fresh ? (
                          <span className="rounded-full bg-primary-container px-1.5 py-0.5 text-[10px] font-bold text-on-primary-container">48h left</span>
                        ) : (
                          <span className="text-[11px] text-on-surface-variant">{person.chatTime}</span>
                        )}
                      </div>
                      <p className={`truncate text-xs ${fresh ? 'font-semibold text-primary' : 'text-on-surface-variant'}`}>{preview}</p>
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
