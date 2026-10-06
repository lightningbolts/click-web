import { cn } from "@/lib/cn";
import { ClickMark } from "./ClickMark";

/**
 * Click mark pulsing, visible only after 200 ms (spec §5.6). Sizes 28 (section) and
 * 44 (pane). Full-screen loaders are forbidden outside `/auth/callback`.
 */
export function Loader({
  size = 28,
  label = "Loading",
  className,
  delayMs = 200,
}: {
  size?: 28 | 44;
  label?: string;
  className?: string;
  delayMs?: number;
}) {
  return (
    <span
      role="status"
      className={cn(
        "ds-loader inline-flex items-center justify-center",
        className,
      )}
      style={{ ["--loader-delay" as string]: `${delayMs}ms` }}
    >
      <ClickMark size={size} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Centered loader for a pane or section. */
export function LoaderBlock({
  size = 28,
  className,
  label,
}: {
  size?: 28 | 44;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("flex min-h-40 items-center justify-center", className)}>
      <Loader size={size} label={label} />
    </div>
  );
}
