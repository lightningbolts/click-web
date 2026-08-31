export const PIN_PRIMARY = '#7c3aed';
export const PIN_SECONDARY = '#6d28d9';

export type OverlayPin = {
  id: string;
  kind: 'person' | 'event';
  initials: string;
};

export function pinBorderForTheme(theme: 'light' | 'dark'): string {
  return theme === 'light' ? '#18181b' : '#ffffff';
}

export function applyPinStack(
  target: HTMLElement,
  pins: OverlayPin[],
  opts?: { size?: number; borderColor?: string },
) {
  const size = opts?.size ?? 36;
  const borderColor = opts?.borderColor ?? '#ffffff';
  const overlap = Math.round(size * 0.28);
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  pins.forEach((pin, index) => {
    const span = document.createElement('span');
    span.textContent = pin.kind === 'event' ? 'E' : pin.initials;
    span.style.display = 'inline-flex';
    span.style.alignItems = 'center';
    span.style.justifyContent = 'center';
    span.style.flexShrink = '0';
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
    span.style.marginLeft = index === 0 ? '0' : `${-overlap}px`;
    span.style.zIndex = String(pins.length - index);
    span.style.position = 'relative';
    span.style.borderRadius = '9999px';
    span.style.fontWeight = '700';
    span.style.color = '#ffffff';
    span.style.backgroundColor = pin.kind === 'person' ? PIN_PRIMARY : PIN_SECONDARY;
    span.style.border = `3px solid ${borderColor}`;
    span.style.fontSize = size >= 34 ? '11px' : '9px';
    span.style.boxShadow =
      borderColor === '#18181b'
        ? '0 1px 4px rgba(0,0,0,0.28)'
        : '0 1px 4px rgba(0,0,0,0.35)';
    row.appendChild(span);
  });
  target.replaceChildren(row);
}

export default function PinStack({
  pins,
  size = 36,
  borderColor = '#ffffff',
}: {
  pins: OverlayPin[];
  size?: number;
  borderColor?: string;
}) {
  const overlap = Math.round(size * 0.28);
  return (
    <div className="flex items-center" aria-hidden={pins.length === 0}>
      {pins.map((pin, index) => (
        <span
          key={pin.id}
          className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
          style={{
            width: size,
            height: size,
            marginLeft: index === 0 ? 0 : -overlap,
            zIndex: pins.length - index,
            backgroundColor: pin.kind === 'person' ? PIN_PRIMARY : PIN_SECONDARY,
            border: `3px solid ${borderColor}`,
            fontSize: size >= 34 ? 11 : 9,
            boxShadow:
              borderColor === '#18181b'
                ? '0 1px 4px rgba(0,0,0,0.28)'
                : '0 1px 4px rgba(0,0,0,0.35)',
          }}
        >
          {pin.kind === 'event' ? 'E' : pin.initials}
        </span>
      ))}
    </div>
  );
}
