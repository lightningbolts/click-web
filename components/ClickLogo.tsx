"use client";

import Image from "next/image";
import { useTheme } from "@/lib/theme/ThemeProvider";

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
 * Click brand mark. Uses the transparent mark by default and swaps to the
 * light stroke set in dark theme (or when appearance="light").
 */
export default function ClickLogo({
  variant = "mark",
  appearance,
  size = 28,
  className,
  alt = "Click",
  priority = false,
}: ClickLogoProps) {
  const { theme } = useTheme();
  const resolvedAppearance = appearance ?? (theme === "dark" ? "light" : "default");
  const src = srcFor(variant, resolvedAppearance);

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
