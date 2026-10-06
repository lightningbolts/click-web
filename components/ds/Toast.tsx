"use client";

import { Toaster, toast as sonnerToast } from "sonner";
import { useTheme } from "@/lib/theme/ThemeProvider";

/**
 * sonner restyled (spec §5.6): bottom-center glass capsule, one at a time, 3 s
 * (errors stay 6 s and are dismissible). Sits above the mobile tab bar.
 */
export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-center"
      visibleToasts={1}
      duration={3000}
      gap={8}
      offset={24}
      mobileOffset={{
        bottom: "calc(var(--tabbar-height) + 12px)",
        left: 16,
        right: 16,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "material-glass shadow-overlay type-body-strong flex w-full max-w-[420px] items-center gap-2.5 rounded-pill px-4 py-2.5 text-fg",
          title: "min-w-0 flex-1",
          description: "type-meta text-fg-secondary",
          icon: "shrink-0 [&_svg]:size-[18px]",
          success: "[&_[data-icon]]:text-online-text",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-warning-text",
          info: "[&_[data-icon]]:text-accent",
          actionButton:
            "type-meta shrink-0 rounded-pill bg-fill-subtle px-3 py-1 font-semibold text-accent",
          cancelButton:
            "type-meta shrink-0 rounded-pill px-2 py-1 font-semibold text-fg-secondary",
          closeButton: "text-fg-tertiary",
        },
      }}
    />
  );
}

type ToastOptions = Parameters<typeof sonnerToast>[1];

/** `toast()` with the spec's error timing (6 s, dismissible). Use this, not sonner directly. */
export const toast = Object.assign(
  (message: Parameters<typeof sonnerToast>[0], opts?: ToastOptions) =>
    sonnerToast(message, opts),
  {
    success: sonnerToast.success,
    info: sonnerToast.info,
    warning: sonnerToast.warning,
    error: (
      message: Parameters<typeof sonnerToast.error>[0],
      opts?: ToastOptions,
    ) =>
      sonnerToast.error(message, {
        duration: 6000,
        closeButton: true,
        ...opts,
      }),
    message: sonnerToast.message,
    loading: sonnerToast.loading,
    dismiss: sonnerToast.dismiss,
    promise: sonnerToast.promise,
  },
);
