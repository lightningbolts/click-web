import type { ReactNode } from 'react';
import { Home, MapPin, PlusCircle, Settings, Users } from 'lucide-react';
import type { PlaygroundScene } from './types';

export type PhoneNavId = 'home' | 'add' | 'clicks' | 'map' | 'settings';

export function PhoneChrome({
  children,
  label,
  activeNav,
  onNav,
}: {
  children: ReactNode;
  label: string;
  activeNav: PhoneNavId;
  onNav: (scene: PlaygroundScene) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[300px] shrink-0">
      <p className="mb-2 text-center text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <div className="relative overflow-hidden rounded-[28px] border border-border-hard bg-surface shadow-sm">
        <div className="flex items-center justify-center bg-surface-container py-2">
          <div className="h-4 w-20 rounded-full bg-on-surface/15" aria-hidden />
        </div>
        <div className="relative h-[560px] overflow-hidden bg-background">{children}</div>
        <nav
          className="grid grid-cols-5 border-t border-border-hard bg-surface px-1 py-2"
          aria-label="App tabs"
        >
          <PhoneNavButton
            label="Home"
            active={activeNav === 'home'}
            onClick={() => onNav('events')}
            icon={<Home className="h-4 w-4" />}
          />
          <PhoneNavButton
            label="Add Click"
            active={activeNav === 'add'}
            onClick={() => onNav('connect')}
            icon={<PlusCircle className="h-4 w-4" />}
          />
          <PhoneNavButton
            label="Clicks"
            active={activeNav === 'clicks'}
            onClick={() => onNav('clicks')}
            icon={<Users className="h-4 w-4" />}
          />
          <PhoneNavButton
            label="Map"
            active={activeNav === 'map'}
            onClick={() => onNav('map')}
            icon={<MapPin className="h-4 w-4" />}
          />
          <PhoneNavButton
            label="Settings"
            active={activeNav === 'settings'}
            onClick={() => onNav('settings')}
            icon={<Settings className="h-4 w-4" />}
          />
        </nav>
      </div>
    </div>
  );
}

function PhoneNavButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[14px] font-semibold leading-tight ${
        active ? 'text-primary' : 'text-on-surface-variant'
      }`}
    >
      <span className={active ? 'rounded-full bg-primary/15 p-1' : 'p-1'}>{icon}</span>
      {label}
    </button>
  );
}

export function WebChrome({
  children,
  label,
  lockScroll = false,
  address = 'click.app / dashboard',
}: {
  children: ReactNode;
  label: string;
  /** Keep the inner pane from scrolling so a child nav can stay full height. */
  lockScroll?: boolean;
  address?: string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <p className="mb-2 text-center text-sm font-semibold uppercase tracking-wider text-on-surface-variant md:text-left">
        {label}
      </p>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-border-hard bg-surface shadow-sm">
        <div className="flex items-center gap-2 border-b border-border-hard bg-surface-container px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-on-surface/25" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-on-surface/25" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-on-surface/25" aria-hidden />
          <span className="ml-2 truncate rounded-[6px] bg-background px-2 py-0.5 text-sm text-on-surface-variant">
            {address}
          </span>
        </div>
        <div
          className={
            lockScroll
              ? 'flex h-[560px] flex-col overflow-hidden bg-background lg:h-[640px]'
              : 'min-h-[420px] flex-1 overflow-auto bg-background sm:min-h-[560px] lg:min-h-[640px]'
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function PlaygroundAvatar({
  initials,
  size = 'md',
  online,
}: {
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
}) {
  const dim = size === 'lg' ? 'h-14 w-14 text-base' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`flex items-center justify-center rounded-full bg-primary font-bold text-on-primary ${dim}`}
      >
        {initials}
      </span>
      {online ? (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-surface bg-emerald-500" />
      ) : null}
    </span>
  );
}

export function VolumeBars({ count }: { count: 1 | 2 | 3 }) {
  const heights = [6, 10, 14];
  return (
    <span className="inline-flex h-4 items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${i < count ? 'bg-primary' : 'bg-on-surface/20'}`}
          style={{ height: heights[i] }}
        />
      ))}
    </span>
  );
}
