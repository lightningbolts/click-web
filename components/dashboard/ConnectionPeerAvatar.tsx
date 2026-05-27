'use client';

function gradientForLabel(label: string): string {
  const key = label.trim() || '?';
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h + key.charCodeAt(i) * 17) % 360;
  }
  const h2 = (h + 48) % 360;
  return `linear-gradient(135deg, hsl(${h} 52% 42%), hsl(${h2} 48% 30%))`;
}

type Size = 'sm' | 'md' | 'lg';

const sizeClass: Record<Size, string> = {
  sm: 'h-8 w-8 min-h-8 min-w-8 text-xs',
  md: 'h-10 w-10 min-h-10 min-w-10 text-sm',
  lg: 'h-11 w-11 min-h-11 min-w-11 text-sm',
};

/**
 * Rounded peer avatar for connection / chat lists: photo when available, else initials on a stable hue.
 */
export function ConnectionPeerAvatar({
  label,
  imageUrl,
  size = 'md',
  showOnline = false,
  isCore = false,
  className = '',
}: {
  label: string;
  imageUrl?: string | null;
  size?: Size;
  showOnline?: boolean;
  isCore?: boolean;
  className?: string;
}) {
  const initial = (label.trim().charAt(0) || '?').toUpperCase();
  const trimmed = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  const showImg = trimmed.length > 0;
  const dim = sizeClass[size];

  const coreRing =
    'rounded-full p-[2.5px] bg-gradient-to-br from-[#9D4EDD] via-[#E8B923] to-[#7B2CBF] shadow-[0_0_12px_rgba(157,78,221,0.35)]';

  const avatarNode = showImg ? (
    <img src={trimmed} alt="" className={`${dim} rounded-full object-cover`} />
  ) : (
    <div
      className={`flex ${dim} items-center justify-center rounded-full font-semibold text-white shadow-inner`}
      style={{ background: gradientForLabel(label) }}
      aria-hidden
    >
      {initial}
    </div>
  );

  return (
    <div className={`relative shrink-0 ${className}`}>
      {isCore ? (
        <div className={coreRing} title="Core connection">
          <div className="rounded-full bg-zinc-950 p-[1.5px]">{avatarNode}</div>
        </div>
      ) : (
        avatarNode
      )}
      {showOnline ? (
        <span
          className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-zinc-950"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
