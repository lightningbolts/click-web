"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

type ClickLogoVariant = "mark" | "boxed" | "icon";

type ClickLogoProps = {
  /** mark = transparent strokes; boxed = rounded tile; icon = full-bleed app icon */
  variant?: ClickLogoVariant;
  /**
   * Force light (for dark backgrounds) or default (for light backgrounds).
   * When omitted, follows the active site theme.
   */
  appearance?: "default" | "light";
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
};

function srcFor(variant: ClickLogoVariant, appearance: "default" | "light"): string {
  if (variant === "icon") return "/brand/logo-icon.svg";
  if (variant === "boxed") {
    return appearance === "light" ? "/brand/logo-light.svg" : "/brand/logo.svg";
  }
  return appearance === "light" ? "/brand/logo-mark-light.svg" : "/brand/logo-mark.svg";
}

/**
 * Click brand mark. Uses the transparent mark by default and swaps to the light stroke set in
 * dark theme (or when appearance="light").
 *
 * Theme-following logos render both marks and let the `.dark` class pick one in CSS. The
 * server cannot know the visitor's theme, so choosing the `src` from JS state made the SSR
 * markup disagree with the client for dark-mode visitors; React then discarded and re-rendered
 * the whole navbar (a visible flash on every page load).
 */
export default function ClickLogo({
  variant = "mark",
  appearance,
  size = 28,
  className,
  alt = "Click",
  priority = false,
}: ClickLogoProps) {
  if (appearance || variant === "icon") {
    return (
      <Image
        src={srcFor(variant, appearance ?? "default")}
        alt={alt}
        width={size}
        height={size}
        className={className}
        priority={priority}
        unoptimized
      />
    );
  }
  return (
    <>
      <Image
        src={srcFor(variant, "default")}
        alt={alt}
        width={size}
        height={size}
        className={cn(className, "dark:hidden")}
        priority={priority}
        unoptimized
      />
      <Image
        src={srcFor(variant, "light")}
        alt=""
        aria-hidden
        width={size}
        height={size}
        className={cn(className, "hidden dark:block")}
        priority={priority}
        unoptimized
      />
    </>
  );
}
