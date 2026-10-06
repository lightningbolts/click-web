'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${r.toString().padStart(2, '0')}` : `${r}s`;
}

export default function ChatThemeAudioPlayer({
  src,
  variant,
  durationHint,
}: {
  src: string;
  variant: 'mine' | 'theirs';
  /** From message metadata before `loadedmetadata` fires */
  durationHint?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(() =>
    typeof durationHint === 'number' && durationHint > 0 ? durationHint : 0,
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    const onEnded = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('ended', onEnded);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);

    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seek = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const el = audioRef.current;
      if (!el) return;
      const dur =
        Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : duration > 0
            ? duration
            : durationHint || 0;
      if (dur <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      el.currentTime = ratio * dur;
      setCurrent(el.currentTime);
    },
    [duration, durationHint],
  );

  const durForUi = Number.isFinite(duration) && duration > 0 ? duration : durationHint || 0;
  const progressPct = durForUi > 0 ? Math.min(100, (current / durForUi) * 100) : 0;

  const shell =
    variant === 'mine'
      ? 'bg-bubble-out text-white'
      : 'bg-bubble-in text-fg';

  const timeClass =
    variant === 'mine' ? 'text-white/75 tabular' : 'text-fg-tertiary tabular';
  const barTrack = variant === 'mine' ? 'bg-white/25' : 'bg-fill-strong';
  const barFill = variant === 'mine' ? 'bg-white' : 'bg-accent';

  const playBtn =
    variant === 'mine'
      ? 'bg-white text-bubble-out hover:bg-white/90'
      : 'bg-action text-white hover:opacity-90';

  return (
    <div
      className={`flex min-w-[220px] max-w-[min(100%,300px)] items-center gap-3 rounded-bubble px-3 py-2 ${shell}`}
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className={`press flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${playBtn}`}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="presentation"
          onClick={seek}
          className={`relative h-1 w-full cursor-pointer rounded-pill ${barTrack}`}
          aria-hidden
        >
          <div
            className={`absolute left-0 top-0 h-full rounded-pill ${barFill}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className={`type-badge mt-1.5 flex justify-between ${timeClass}`}>
          <span>{formatTime(current)}</span>
          <span>{formatTime(durForUi)}</span>
        </div>
      </div>
    </div>
  );
}
