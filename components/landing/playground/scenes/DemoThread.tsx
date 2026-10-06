'use client';

import { CalendarDays, CalendarPlus, Check, MapPin, Send } from 'lucide-react';
import { useState } from 'react';
import type { ChatMessage, MemoryCapsule, PlaygroundActions, PlaygroundPerson } from '../types';

/** A new Click gets a 48-hour window to say hi before it quietly archives (hygiene, not a timer). */
export function isNewClick(thread: readonly ChatMessage[]): boolean {
  return thread.every((m) => m.from === 'system');
}

function sayHiPrompts(person: PlaygroundPerson, memory?: MemoryCapsule): string[] {
  const first = person.name.split(' ')[0];
  return [
    memory ? `Great meeting you at ${memory.place}, ${first}!` : `Great meeting you, ${first}!`,
    memory?.label ? `What did you think of the ${memory.label.toLowerCase()}?` : 'What brought you there?',
    'Want to grab coffee this week?',
  ];
}

function suggestedPlan(memory?: MemoryCapsule) {
  return { title: 'Coffee', when: 'Tomorrow · 10:00 AM', place: memory?.place ?? 'Suzzallo Espresso' };
}

/**
 * Demo conversation: text bubbles, the in-app plan card with a Going RSVP, say-hi prompts for
 * a brand-new Click, and a composer with "Plan". Shared by the phone and web previews so both
 * show the same thread.
 */
export default function DemoThread({
  person,
  memory,
  thread,
  actions,
}: {
  person: PlaygroundPerson;
  memory?: MemoryCapsule;
  thread: readonly ChatMessage[];
  actions: PlaygroundActions;
}) {
  const [draft, setDraft] = useState('');
  const first = person.name.split(' ')[0];

  const send = (text: string) => {
    if (!text.trim()) return;
    actions.sendMessage(person.id, text.trim());
    setDraft('');
  };

  return (
    <>
      <ul className="flex flex-1 flex-col gap-2 overflow-auto px-3 py-3">
        {thread.map((msg) =>
          msg.from === 'system' ? (
            <li key={msg.id} className="self-center rounded-full bg-surface-raised px-3 py-1 text-[11px] font-semibold text-fg-secondary">
              {msg.text}
            </li>
          ) : msg.plan ? (
            <li
              key={msg.id}
              className={`w-[min(100%,15rem)] overflow-hidden rounded-[16px] border bg-surface text-fg ${
                msg.from === 'you' ? 'ml-auto border-action/40' : 'border-hairline'
              }`}
              data-testid="playground-plan-card"
            >
              <div className="flex gap-2.5 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-selection text-accent">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-fg-secondary">Plan</p>
                  <p className="text-sm font-bold">{msg.plan.title}</p>
                  <p className="text-xs text-fg-secondary">{msg.plan.when}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-accent">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {msg.plan.place}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-hairline px-3 py-2">
                <span className="text-[11px] font-semibold text-fg-secondary">
                  {msg.plan.going ? 'You’re going' : 'Not going'}
                </span>
                <button
                  type="button"
                  onClick={() => actions.togglePlanGoing(person.id, msg.id)}
                  aria-pressed={msg.plan.going}
                  className={`inline-flex h-7 items-center gap-1 rounded-[8px] border px-2 text-[11px] font-bold ${
                    msg.plan.going ? 'border-action bg-action text-on-action' : 'border-hairline text-fg'
                  }`}
                >
                  <Check className="h-3 w-3" aria-hidden />
                  Going
                </button>
              </div>
            </li>
          ) : (
            <li
              key={msg.id}
              className={`max-w-[80%] rounded-[16px] px-3 py-2 text-sm ${
                msg.from === 'you'
                  ? 'ml-auto bg-action text-on-action'
                  : 'border border-hairline bg-surface-raised text-fg'
              }`}
            >
              <p>{msg.text}</p>
              <p className={`mt-1 text-[10px] ${msg.from === 'you' ? 'text-on-action/70' : 'text-fg-secondary'}`}>
                {msg.time}
              </p>
            </li>
          ),
        )}
        {isNewClick(thread) ? (
          <li className="mt-auto rounded-[16px] border border-hairline bg-surface p-3" data-testid="playground-say-hi">
            <p className="text-xs font-bold text-fg">Say hi to {first}</p>
            <p className="mt-0.5 text-[11px] text-fg-secondary">New Clicks stay active for 48 hours. A hello keeps it going.</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {sayHiPrompts(person, memory).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="rounded-[10px] border border-hairline px-2.5 py-1.5 text-left text-xs font-semibold text-fg hover:bg-surface-raised"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </li>
        ) : null}
      </ul>
      <form
        className="flex gap-2 border-t border-hairline p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <button
          type="button"
          onClick={() => actions.sendPlan(person.id, suggestedPlan(memory))}
          className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-hairline px-2.5 text-xs font-bold text-fg hover:bg-surface-raised"
          aria-label={`Plan a hangout with ${first}`}
        >
          <CalendarPlus className="h-4 w-4 text-accent" aria-hidden />
          Plan
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${first}…`}
          className="fc-input min-w-0 flex-1 px-3 py-2"
          aria-label="Message"
        />
        <button type="submit" className="fc-btn-primary px-3 py-2" aria-label="Send message">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </>
  );
}
