"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog, DialogClose } from "./Dialog";

export type ConfirmOptions = {
  title: ReactNode;
  /** The consequence, in one sentence. */
  message?: ReactNode;
  confirmLabel: string;
  /** The safe choice; focused by default (iOS "Keep…"). */
  cancelLabel?: string;
  destructive?: boolean;
};

/**
 * The only confirmation pattern (spec §5.4); replaces `window.confirm` / `alert`.
 * Safe action is focused by default; destructive confirms use `destructive-solid`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  busy,
}: ConfirmOptions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={message}
      size="sm"
      hideClose
      initialFocusSelector="[data-confirm-safe]"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" data-confirm-safe="">
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={destructive ? "destructive-solid" : "primary"}
            loading={busy}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/**
 * Promise-based confirm for imperative call sites:
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title: 'Remove?', confirmLabel: 'Remove', destructive: true }))) return;
 *   …render {confirmDialog}
 */
export function useConfirm(): [
  (options: ConfirmOptions) => Promise<boolean>,
  ReactNode,
] {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    resolver.current?.(false);
    setState(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  };

  const node = state ? (
    <ConfirmDialog
      {...state}
      open
      onOpenChange={(o) => {
        if (!o) settle(false);
      }}
      onConfirm={() => settle(true)}
    />
  ) : null;

  return [confirm, node];
}
