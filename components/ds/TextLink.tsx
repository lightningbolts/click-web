import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & {
  href: string;
  /** Opens in a new tab and shows a 14 px ↗. Defaults to true for absolute http(s) URLs. */
  external?: boolean;
};

/** Inline link (spec §5.1): `--accent`, underline on hover only. */
export function TextLink({
  href,
  external,
  className,
  children,
  prefetch,
  replace,
  scroll,
  ...rest
}: Props) {
  const isExternal = external ?? /^https?:\/\//.test(href);
  const cls = cn(
    "inline-flex items-center gap-0.5 font-semibold text-accent no-underline hover:underline",
    className,
  );
  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        {...(rest as ComponentPropsWithoutRef<"a">)}
      >
        {children}
        <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={cls}
      prefetch={prefetch}
      replace={replace}
      scroll={scroll}
      {...rest}
    >
      {children}
    </Link>
  );
}
