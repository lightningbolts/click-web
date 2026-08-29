import type { CSSProperties, ReactElement } from "react";

/**
 * Current Click mark (overlapping circle + rounded square) for next/og.
 * Geometry matches public/brand/logo-icon.svg after the horizontal flip.
 */
export function BrandMarkOg({ size }: { size: number }): ReactElement {
  const s = size / 128;
  const stroke = Math.max(2, 7 * s);
  const circle: CSSProperties = {
    position: "absolute",
    display: "flex",
    left: 18 * s,
    top: 18 * s,
    width: 56 * s,
    height: 56 * s,
    border: `${stroke}px solid #C4B5FD`,
    borderRadius: 9999,
  };
  const square: CSSProperties = {
    position: "absolute",
    display: "flex",
    left: 52 * s,
    top: 48 * s,
    width: 52 * s,
    height: 52 * s,
    border: `${stroke}px solid #4C1D95`,
    borderRadius: 6 * s,
  };
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        backgroundColor: "#0F0A1A",
        position: "relative",
      }}
    >
      <div style={circle} />
      <div style={square} />
    </div>
  );
}
