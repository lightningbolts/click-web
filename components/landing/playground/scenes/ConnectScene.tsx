'use client';

import { useReducedMotion } from 'framer-motion';
import { QrCode, ScanLine, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import DemoQr from '../DemoQr';
import { PlaygroundAvatar, VolumeBars } from '../DeviceChrome';
import { JORDAN, JORDAN_DEFAULT_MEMORY, MEMORY_PRESETS, PLAYGROUND_PEOPLE } from '../mockData';
import type { MemoryCapsule, PlaygroundActions, PlaygroundState } from '../types';

type Method = 'tap' | 'qr' | 'scan';
type Phase = 'idle' | 'handshake' | 'memory' | 'done';

export default function ConnectScene({
  state,
  actions,
  onAnnounce,
}: {
  state: PlaygroundState;
  actions: PlaygroundActions;
  onAnnounce: (message: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const already = state.connectedIds.has(JORDAN.id);
  const [method, setMethod] = useState<Method>('tap');
  const [phase, setPhase] = useState<Phase>(already ? 'done' : 'idle');
  const [label, setLabel] = useState<string>(MEMORY_PRESETS[0]);

  useEffect(() => {
    if (phase !== 'handshake') return undefined;
    const id = window.setTimeout(() => setPhase('memory'), 900);
    return () => window.clearTimeout(id);
  }, [phase]);

  const startTap = () => {
    if (already || phase !== 'idle') return;
    if (reduceMotion) {
      setPhase('memory');
      return;
    }
    setPhase('handshake');
  };

  const confirmMemory = () => {
    const memory: MemoryCapsule = { ...JORDAN_DEFAULT_MEMORY, label };
    actions.connectPerson(JORDAN.id, memory);
    setPhase('done');
    onAnnounce(`Connected with ${JORDAN.name}. ${label} at Kane Hall lobby.`);
  };

  const connected = PLAYGROUND_PEOPLE.filter((p) => state.connectedIds.has(p.id));
  const jordanMemory = state.memories[JORDAN.id] ?? JORDAN.memory;

  return (
    <div className="flex h-full flex-col overflow-auto bg-background" data-testid="playground-scene-connect">
      <div className="border-b border-border-hard px-4 py-3">
        <h3 className="text-lg font-bold text-on-surface">Add Click</h3>
        <p className="mt-1 text-xs text-on-surface-variant">
          Connect with QR or Tap to Connect, or join a venue community hub
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1 px-3 py-3" role="group" aria-label="Connect method">
        {(
          [
            { id: 'tap' as const, label: 'Tap', icon: Smartphone },
            { id: 'qr' as const, label: 'My QR', icon: QrCode },
            { id: 'scan' as const, label: 'Scan', icon: ScanLine },
          ]
        ).map((item) => {
          const Icon = item.icon;
          const selected = method === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMethod(item.id)}
              className={`flex flex-col items-center gap-1 rounded-[12px] border px-2 py-2 text-[11px] font-semibold ${
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border-hard bg-surface text-on-surface-variant'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {method === 'tap' ? (
        <div className="px-4 pb-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Nearby
          </p>
          <div className="rounded-[16px] border border-border-hard bg-surface p-4">
            <div className="flex items-center gap-3">
              <PlaygroundAvatar initials={JORDAN.initials} online />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-on-surface">{JORDAN.name}</p>
                <p className="text-xs text-on-surface-variant">{JORDAN.nearbyMeters}m · Kane Hall lobby</p>
              </div>
            </div>

            {phase === 'idle' ? (
              <button
                type="button"
                data-testid="playground-tap-jordan"
                onClick={startTap}
                className="fc-btn-primary mt-4 w-full py-3"
              >
                Tap to Click with {JORDAN.name}
              </button>
            ) : null}

            {phase === 'handshake' ? (
              <div className="mt-4 flex flex-col items-center py-4" role="status">
                <div className="relative h-16 w-16">
                  <span className="absolute inset-0 rounded-full border border-primary/40 animate-ping motion-reduce:animate-none" />
                  <span className="absolute inset-2 rounded-full bg-primary/20" />
                  <span className="absolute inset-5 rounded-full bg-primary" />
                </div>
                <p className="mt-3 text-xs font-medium text-on-surface">Verifying same room…</p>
                <p className="mt-1 text-[11px] text-on-surface-variant">BLE + ultrasonic handshake</p>
              </div>
            ) : null}

            {phase === 'memory' ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-on-surface">How did you meet?</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Encounter labels">
                  {MEMORY_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLabel(preset)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        label === preset
                          ? 'bg-primary text-on-primary'
                          : 'border border-border-hard bg-surface-container text-on-surface'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Kane Hall lobby · Clear · 64°F · Loud
                </p>
                <button type="button" onClick={confirmMemory} className="fc-btn-primary w-full py-2.5">
                  Save memory
                </button>
              </div>
            ) : null}

            {phase === 'done' && jordanMemory ? (
              <div className="mt-4 rounded-[12px] border border-border-hard bg-secondary-container p-3">
                <p className="text-sm font-semibold text-on-secondary-container">You Clicked</p>
                <p className="mt-1 text-xs text-on-secondary-container">
                  {jordanMemory.label} · {jordanMemory.place}
                </p>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-on-surface-variant">
                  {jordanMemory.weather} <VolumeBars count={jordanMemory.volume} /> {jordanMemory.noise}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {method === 'qr' ? (
        <div className="px-4 pb-4">
          <div className="rounded-[16px] border border-border-hard bg-surface p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary">My QR Code</p>
            <div className="relative mx-auto mt-3 w-fit">
              <div className="absolute inset-0 bg-primary/30 blur-xl" />
              <div className="relative rounded-2xl border border-border-hard bg-[#121212] p-3">
                <DemoQr size={148} />
              </div>
            </div>
            <p className="mt-3 font-mono text-sm font-bold tracking-wider text-primary">CK-1842</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Scan this code to connect with Alex. Token refreshes every 90s.
            </p>
          </div>
        </div>
      ) : null}

      {method === 'scan' ? (
        <div className="px-4 pb-4">
          <div className="flex h-48 flex-col items-center justify-center rounded-[16px] border border-dashed border-border-hard bg-surface-container">
            <ScanLine className="h-8 w-8 text-primary" />
            <p className="mt-2 text-sm font-semibold text-on-surface">Point at their Click QR</p>
            <p className="mt-1 px-6 text-center text-xs text-on-surface-variant">
              Demo only — use Tap above to form a connection.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-auto border-t border-border-hard px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
          Your Clicks
        </p>
        <ul className="mt-2 space-y-2">
          {connected.map((person) => {
            const memory = state.memories[person.id] ?? person.memory;
            return (
              <li key={person.id} className="flex items-center gap-2">
                <PlaygroundAvatar initials={person.initials} size="sm" online={person.online} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-on-surface">{person.name}</p>
                  <p className="truncate text-[11px] text-on-surface-variant">
                    {memory ? `${memory.label} · ${memory.place}` : 'Just Clicked'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
