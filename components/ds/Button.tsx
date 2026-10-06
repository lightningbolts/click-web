import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tinted"
  | "plain"
  | "destructive"
  | "destructive-solid";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-action text-on-action hover:bg-action-hover active:bg-action-pressed",
  secondary: "bg-fill-subtle text-fg hover:bg-fill-strong",
  tinted:
    "bg-selection text-accent hover:bg-[color-mix(in_srgb,var(--selection)_80%,var(--accent)_12%)]",
  plain: "bg-transparent text-accent hover:bg-hover",
  destructive:
    "bg-destructive-fill text-destructive hover:bg-[color-mix(in_srgb,var(--destructive-fill)_85%,var(--destructive)_12%)]",
  "destructive-solid": "bg-destructive text-white hover:brightness-110",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px] leading-[18px] font-semibold",
  md: "h-10 gap-2 px-4 type-body-strong",
  lg: "h-12 gap-2 px-5 text-base leading-6 font-semibold",
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 18 };

export function buttonClassName({
  variant = "secondary",
  size = "md",
  fullWidth,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(
    "press relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-pill",
    "disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
    "[@media(pointer:coarse)]:min-h-11",
    VARIANT[variant],
    SIZE[size],
    variant === "plain" && size !== "sm" && "px-3",
    fullWidth && "w-full",
    className,
  );
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 18 px leading icon (16 at sm). */
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  /** Replaces the label with a spinner and keeps the width. */
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
};

type ButtonAsButton = CommonProps &
  ComponentPropsWithoutRef<"button"> & { href?: undefined };
type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & {
    href: string;
    disabled?: boolean;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

function Content({
  icon: Icon,
  trailingIcon: Trailing,
  loading,
  size = "md",
  children,
}: Pick<
  CommonProps,
  "icon" | "trailingIcon" | "loading" | "size" | "children"
>) {
  const px = ICON_SIZE[size];
  return (
    <>
      <span
        className={cn(
          "inline-flex items-center gap-[inherit]",
          loading && "invisible",
        )}
      >
        {Icon ? (
          <Icon size={px} strokeWidth={2} aria-hidden className="shrink-0" />
        ) : null}
        {children}
        {Trailing ? (
          <Trailing
            size={px}
            strokeWidth={2}
            aria-hidden
            className="shrink-0"
          />
        ) : null}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      ) : null}
    </>
  );
}

/**
 * Capsule button (spec §5.1). At most one `primary` per visual region.
 * Pass `href` to render a Next `<Link>` with the same look.
 */
export function Button(props: ButtonProps) {
  const {
    variant,
    size,
    icon,
    trailingIcon,
    loading,
    fullWidth,
    className,
    children,
  } = props;
  const cls = buttonClassName({ variant, size, fullWidth, className });
  const content = (
    <Content
      icon={icon}
      trailingIcon={trailingIcon}
      loading={loading}
      size={size}
    >
      {children}
    </Content>
  );

  if (typeof props.href === "string") {
    const {
      variant: _v,
      size: _s,
      icon: _i,
      trailingIcon: _t,
      loading: _l,
      fullWidth: _f,
      className: _c,
      children: _ch,
      disabled,
      href,
      ...rest
    } = props;
    if (disabled) {
      return (
        <span className={cls} aria-disabled="true" role="link">
          {content}
        </span>
      );
    }
    return (
      <Link href={href} className={cls} {...rest}>
        {content}
      </Link>
    );
  }

  const {
    variant: _v,
    size: _s,
    icon: _i,
    trailingIcon: _t,
    loading: _l,
    fullWidth: _f,
    className: _c,
    children: _ch,
    type = "button",
    disabled,
    ...rest
  } = props as ButtonAsButton;
  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}
