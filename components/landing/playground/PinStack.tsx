const PRIMARY = '#630ed4';
const SECONDARY = '#224CFF';

export type OverlayPin = {
  id: string;
  kind: 'person' | 'event';
  initials: string;
};

export default function PinStack({
  pins,
  size = 36,
}: {
  pins: OverlayPin[];
  size?: number;
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
            backgroundColor: pin.kind === 'person' ? PRIMARY : SECONDARY,
            border: '3px solid #ffffff',
            fontSize: size >= 34 ? 11 : 9,
            boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
          }}
        >
          {pin.kind === 'event' ? 'E' : pin.initials}
        </span>
      ))}
    </div>
  );
}
