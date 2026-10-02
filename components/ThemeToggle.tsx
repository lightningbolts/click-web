"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { cn } from "@/lib/cn";

export default function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      // Icon and label follow the `.dark` class in CSS, so server HTML always matches the
      // client (the theme is only known in the browser).
      aria-label="Toggle light or dark theme"
      title="Toggle theme"
      className={cn(
        "inline-flex items-center justify-center rounded-[8px] border border-border-hard bg-surface text-on-surface hover:bg-surface-container-low active:translate-x-0.5 active:translate-y-0.5",
        showLabel ? "h-9 gap-2 px-3" : "h-9 w-9 p-0",
        className,
      )}
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      <Sun className="hidden size-4 text-primary dark:block" aria-hidden />
      <Moon className="block size-4 text-primary dark:hidden" aria-hidden />
      {showLabel ? (
        <span className="text-sm font-semibold">
          <span className="hidden dark:inline">Light mode</span>
          <span className="dark:hidden">Dark mode</span>
        </span>
      ) : null}
    </button>
  );
}
