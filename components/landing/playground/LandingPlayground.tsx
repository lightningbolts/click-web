'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { SegmentedControl } from '@/components/ds/SegmentedControl';
import { cn } from '@/lib/cn';
import { PhoneApp } from './PhoneApp';
import { WebApp } from './WebApp';
import { INITIAL_MESSAGES, REPLIES } from './mockData';
import { DemoContext, guideSteps, initialState, reducer, type DemoAction, type FocusTarget } from './state';
import type { Device, ThreadId } from './types';

const REPLY_DELAY_MS = 1400;
/** Seeded history never triggers a reply; only what the visitor sends does. */
const SEEDED_IDS = new Set(Object.values(INITIAL_MESSAGES).flatMap((thread) => thread.map((m) => m.id)));

/**
 * Click on an iPhone and on the web, driven by one shared state: what you do on one device
 * shows up on the other. A short guided path above the devices walks through the core loop.
 */
export default function LandingPlayground() {
  const [state, baseDispatch] = useReducer(reducer, undefined, initialState);
  const [device, setDevice] = useState<Device>('phone');
  const [typing, setTyping] = useState<ReadonlySet<ThreadId>>(() => new Set());
  const replied = useRef(new Set<ThreadId>());
  const timers = useRef(new Map<ThreadId, number>());

  const dispatch = useCallback((action: DemoAction) => {
    if (action.type === 'reset') {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current.clear();
      replied.current.clear();
      setTyping(new Set());
    }
    baseDispatch(action);
  }, []);

  // Each person answers your first message once, after a beat of "typing…".
  useEffect(() => {
    for (const [thread, reply] of Object.entries(REPLIES)) {
      const last = state.messages[thread]?.at(-1);
      if (last?.from !== 'you' || SEEDED_IDS.has(last.id) || replied.current.has(thread)) continue;
      replied.current.add(thread);
      setTyping((s) => new Set(s).add(thread));
      timers.current.set(
        thread,
        window.setTimeout(() => {
          timers.current.delete(thread);
          setTyping((s) => {
            const next = new Set(s);
            next.delete(thread);
            return next;
          });
          baseDispatch({ type: 'send', thread, text: reply, from: thread });
        }, REPLY_DELAY_MS),
      );
    }
  }, [state.messages]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const context = useMemo(() => ({ state, dispatch, typing, showDevice: setDevice }), [state, dispatch, typing]);
  const steps = guideSteps(state);
  const done = steps.filter((s) => s.done).length;
  const focus = (target: FocusTarget) => dispatch({ type: 'focus', target });

  return (
    <DemoContext.Provider value={context}>
      <div data-testid="landing-playground" className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <ol
            aria-label="Things to try"
            className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-1 lg:flex-wrap lg:overflow-visible lg:px-0"
          >
            {steps.map((step, i) => (
              <li key={step.id} className="shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() => focus(step.target)}
                  data-testid={`guide-${step.id}`}
                  aria-label={`${step.title}${step.done ? ', done' : ''}`}
                  className={cn(
                    'press type-body-strong flex h-10 items-center gap-2 rounded-pill pl-1.5 pr-4 transition-colors duration-[var(--d-fast)]',
                    step.done ? 'bg-selection text-fg' : 'bg-fill-subtle text-fg hover:bg-fill-strong',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'type-meta tabular flex size-7 items-center justify-center rounded-full font-semibold',
                      step.done ? 'bg-action text-on-action' : 'bg-surface text-fg-secondary',
                    )}
                  >
                    {step.done ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </span>
                  {step.title}
                </button>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <p className="type-meta tabular text-fg-secondary" aria-live="polite">
              {done} of {steps.length} done
            </p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'reset' })}
              className="press type-body-strong flex h-10 items-center gap-1.5 rounded-pill px-3 text-accent hover:bg-hover"
            >
              <RotateCcw size={16} aria-hidden />
              Start over
            </button>
          </div>
        </div>

        <SegmentedControl
          className="mx-auto w-full max-w-[320px] lg:hidden"
          fullWidth
          label="Preview"
          value={device}
          onChange={setDevice}
          segments={[
            { value: 'phone', label: 'iPhone' },
            { value: 'web', label: 'Web' },
          ]}
        />

        <div className="flex items-start gap-8">
          <div className={cn('w-full lg:block lg:w-[360px] lg:shrink-0', device === 'phone' ? 'block' : 'hidden')}>
            <PhoneApp />
          </div>
          <div className={cn('min-w-0 flex-1 lg:flex', device === 'web' ? 'flex' : 'hidden')}>
            <WebApp />
          </div>
        </div>
      </div>
    </DemoContext.Provider>
  );
}
