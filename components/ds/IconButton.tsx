import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type IconButtonVariant = "ghost" | "filled" | "glass" | "action";
export type IconButtonSize = "sm" | "md";

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: "text-fg-secondary hover:bg-hover hover:text-fg",
  filled: "bg-fill-subtle text-fg hover:bg-fill-strong",
  glass: "material-glass text-fg shadow-overlay",
  action:
    "bg-action text-on-action hover:bg-action-hover active:bg-action-pressed",
};

export function iconButtonClassName({
  variant = "ghost",
  size = "md",
  className,
}: {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  className?: string;
} = {}) {
  return cn(
    "press hit-44 inline-flex shrink-0 items-center justify-center rounded-full",
    "disabled:cursor-not-allowed disabled:opacity-40",
    size === "md" ? "size-9" : "size-8",
    VARIANT[variant],
    className,
  );
}

type Common = {
  icon: LucideIcon;
  /** Required: icon buttons have no visible label. */
  "aria-label": string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Small `--live` dot at the top-right (e.g. unread activity). */
  dot?: boolean;
};

export type IconButtonProps =
  | (Common &
      Omit<ComponentPropsWithoutRef<"button">, "children"> & {
        href?: undefined;
      })
  | (Common &
      Omit<ComponentPropsWithoutRef<typeof Link>, "href" | "children"> & {
        href: string;
      });

/** Circular icon button, 36 (md) / 32 (sm) visible with a 44 px touch target (spec §5.1). */
export function IconButton(props: IconButtonProps) {
  const { icon: Icon, variant, size, dot, className, ...rest } = props;
  const cls = iconButtonClassName({
    variant,
    size,
    className: cn(dot && "relative", className),
  });
  const inner = (
    <>
      <Icon size={size === "sm" ? 16 : 20} strokeWidth={1.75} aria-hidden />
      {dot ? (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 size-2 rounded-full bg-live ring-2 ring-[var(--bg-elevated)]"
        />
      ) : null}
    </>
  );
  if ("href" in rest && typeof rest.href === "string") {
    const { href, ...linkRest } = rest as Omit<
      ComponentPropsWithoutRef<typeof Link>,
      "href"
    > & { href: string };
    return (
      <Link href={href} className={cls} {...linkRest}>
        {inner}
      </Link>
    );
  }
  const { type = "button", ...buttonRest } =
    rest as ComponentPropsWithoutRef<"button">;
  return (
    <button type={type} className={cls} {...buttonRest}>
      {inner}
    </button>
  );
}
