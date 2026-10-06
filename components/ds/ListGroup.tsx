import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * iOS inset-grouped list for web (spec §5.4). Rows divide themselves with hairlines
 * inset to the title column.
 */
export function ListGroup({
  header,
  footer,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <section className={className} aria-label={ariaLabel}>
      {header ? (
        <h3 className="type-meta mb-2 px-4 font-semibold text-fg-secondary">
          {header}
        </h3>
      ) : null}
      <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        {children}
      </ul>
      {footer ? (
        <p className="type-meta mt-2 px-4 text-fg-tertiary">{footer}</p>
      ) : null}
    </section>
  );
}

type RowBase = {
  icon?: LucideIcon;
  /** Avatar (32 or 40) or any custom leading node; overrides `icon`. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Value text, toggle, small button, pill… */
  trailing?: ReactNode;
  /** Show a trailing chevron (navigation rows). Defaults to true when `href` is set. */
  chevron?: boolean;
  destructive?: boolean;
  /** Navigation lists use body-strong titles. */
  strong?: boolean;
  className?: string;
};

type RowProps =
  | (RowBase & { href: string; onClick?: undefined } & Omit<
        ComponentPropsWithoutRef<typeof Link>,
        "href" | "title"
      >)
  | (RowBase & { href?: undefined; onClick: () => void; disabled?: boolean })
  | (RowBase & { href?: undefined; onClick?: undefined });

function RowInner({
  icon: Icon,
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  destructive,
  strong,
}: RowBase) {
  const hasLeading = Boolean(leading || Icon);
  return (
    <>
      {hasLeading ? (
        <span
          className={cn(
            "flex w-7 shrink-0 items-center justify-center",
            destructive ? "text-destructive" : "text-fg-secondary",
            leading && "w-auto",
          )}
        >
          {leading ??
            (Icon ? <Icon size={20} strokeWidth={1.75} aria-hidden /> : null)}
        </span>
      ) : null}
      <span
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 self-stretch py-3",
          // Hairline inset to the title column, hidden on the first row.
          "shadow-[inset_0_1px_0_var(--hairline)] group-first/row:shadow-none",
        )}
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate",
              strong ? "type-body-strong" : "type-body",
              destructive ? "text-destructive" : "text-fg",
            )}
          >
            {title}
          </span>
          {subtitle ? (
            <span className="type-meta block truncate text-fg-tertiary">
              {subtitle}
            </span>
          ) : null}
        </span>
        {trailing ? (
          <span className="type-body shrink-0 text-fg-tertiary">
            {trailing}
          </span>
        ) : null}
        {chevron ? (
          <ChevronRight
            size={16}
            strokeWidth={2}
            aria-hidden
            className="shrink-0 text-fg-tertiary"
          />
        ) : null}
      </span>
    </>
  );
}

const rowCls = (interactive: boolean, subtitle: boolean, className?: string) =>
  cn(
    "flex w-full items-center gap-3 px-4 text-left",
    subtitle ? "min-h-16" : "min-h-[52px]",
    interactive &&
      "transition-colors duration-[var(--d-fast)] hover:bg-hover active:bg-fill-subtle",
    "disabled:cursor-not-allowed disabled:opacity-40",
    className,
  );

export function ListRow(props: RowProps) {
  const {
    icon,
    leading,
    title,
    subtitle,
    trailing,
    chevron,
    destructive,
    strong,
    className,
  } = props;
  const inner = {
    icon,
    leading,
    title,
    subtitle,
    trailing,
    destructive,
    strong,
  };
  if (typeof props.href === "string") {
    const {
      icon: _i,
      leading: _l,
      title: _t,
      subtitle: _s,
      trailing: _tr,
      chevron: _c,
      destructive: _d,
      strong: _st,
      className: _cl,
      href,
      ...rest
    } = props;
    return (
      <li className="group/row">
        <Link
          href={href}
          className={rowCls(true, Boolean(subtitle), className)}
          {...rest}
        >
          <RowInner {...inner} chevron={chevron ?? true} />
        </Link>
      </li>
    );
  }
  if (props.onClick) {
    return (
      <li className="group/row">
        <button
          type="button"
          onClick={props.onClick}
          disabled={"disabled" in props ? props.disabled : undefined}
          className={rowCls(true, Boolean(subtitle), className)}
        >
          <RowInner {...inner} chevron={chevron} />
        </button>
      </li>
    );
  }
  return (
    <li
      className={cn("group/row", rowCls(false, Boolean(subtitle), className))}
    >
      <RowInner {...inner} chevron={chevron} />
    </li>
  );
}
