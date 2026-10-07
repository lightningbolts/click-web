"use client";

import Image from "next/image";
import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  generateCardVisual,
  type CardVisual as CardVisualData,
} from "@/lib/ui/generateCardVisual";
import { cardVisualStyle } from "@/lib/ui/cardVisualPattern";

export type CardVisualRatio = "1:1" | "4:3" | "16:9" | "16:5";

const RATIO: Record<CardVisualRatio, string> = {
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
  "16:9": "aspect-video",
  "16:5": "aspect-[16/5]",
};

const RADIUS = {
  0: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
} as const;

/**
 * Generated identity art (spec §5.3). Seeded with the **raw entity id** so it matches iOS
 * `EventVisual` and Android `CardVisual`. A photo renders over the gradient, which doubles
 * as its placeholder (no CLS). No scrim unless `children` (overlaid text) are passed.
 */
export function CardVisual({
  seed,
  visual,
  ratio,
  radius = "lg",
  glyph,
  photoUrl,
  sizes = "(max-width: 768px) 100vw, 560px",
  priority,
  className,
  style,
  children,
}: {
  seed: string;
  visual?: CardVisualData;
  /** Omit to size with className (e.g. `size-24`). */
  ratio?: CardVisualRatio;
  radius?: keyof typeof RADIUS;
  /** Centered icon element (e.g. `<Building2 />`), sized here; an element, not a component, so Server Components can pass it. */
  glyph?: ReactNode;
  photoUrl?: string | null;
  sizes?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const v = visual ?? generateCardVisual(seed);
  const url = photoUrl?.trim() || null;
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = url && failed !== url;
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden",
        ratio && RATIO[ratio],
        RADIUS[radius],
        className,
      )}
      style={{ ...cardVisualStyle(v), ...style }}
    >
      {showPhoto ? (
        <Image
          src={url}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          onError={() => setFailed(url)}
        />
      ) : glyph ? (
        <span
          className="absolute inset-0 flex items-center justify-center text-white/85 [&>svg]:size-[38%] [&>svg]:max-h-16 [&>svg]:max-w-16 [&>svg]:stroke-[1.75]"
          aria-hidden
        >
          {glyph}
        </span>
      ) : null}
      {children ? (
        <>
          <div
            className="absolute inset-0"
            style={{ background: v.contentScrim }}
            aria-hidden
          />
          <div className="relative z-10 h-full text-white">{children}</div>
        </>
      ) : null}
    </div>
  );
}
