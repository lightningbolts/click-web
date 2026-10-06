import { cn } from "@/lib/cn";

/**
 * Inline Click mark (same geometry as `public/brand/logo-mark.svg`) so the top bar and
 * loaders cost no image request and follow the theme via tokens.
 */
export function ClickMark({
  size = 24,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
    >
      <g transform="translate(128 0) scale(-1 1)" strokeWidth="9">
        <rect
          x="24"
          y="48"
          width="52"
          height="52"
          rx="6"
          stroke="var(--brand)"
          className="dark:[stroke:var(--accent)]"
        />
        <circle
          cx="82"
          cy="46"
          r="28"
          stroke="color-mix(in srgb, var(--accent) 45%, transparent)"
        />
      </g>
    </svg>
  );
}
