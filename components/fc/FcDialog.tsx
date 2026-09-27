'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { fadePresence, fadeTransition, platePresence } from '@/lib/motion';
import { cn } from '@/lib/cn';

/**
 * The one modal plate for click-web. Radix owns the hard parts (portal to `body` so no
 * stacking context can trap it under the navbar, focus trap, Escape, scroll lock with
 * scrollbar-gap compensation so the page never shifts); Framer only animates the plate.
 * The dialog stays mounted through its exit animation, so opening and closing are
 * continuous instead of a mount/unmount flash.
 */
export function FcDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  size = 'md',
  initialFocusRef,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Element to focus on open (defaults to the first focusable control). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  testId?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[100000] bg-black/45"
                {...(reduceMotion ? {} : fadePresence)}
                transition={fadeTransition(0.18)}
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[100001] flex items-end justify-center p-3 sm:items-center sm:p-6">
              <Dialog.Content
                asChild
                forceMount
                onOpenAutoFocus={(event) => {
                  if (initialFocusRef?.current) {
                    event.preventDefault();
                    initialFocusRef.current.focus();
                  }
                }}
              >
                <motion.div
                  data-testid={testId}
                  className={cn(
                    'pointer-events-auto relative max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-[16px] border border-border-hard bg-surface p-6 text-on-surface shadow-xl focus:outline-none',
                    size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md',
                    className,
                  )}
                  {...(reduceMotion ? {} : platePresence)}
                  transition={fadeTransition(0.28)}
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Dialog.Title className="text-xl font-bold text-on-surface">{title}</Dialog.Title>
                      {description ? (
                        <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-on-surface-variant">
                          {description}
                        </Dialog.Description>
                      ) : (
                        <Dialog.Description className="sr-only">{title}</Dialog.Description>
                      )}
                    </div>
                    <Dialog.Close
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-border-hard text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Dialog.Close>
                  </div>
                  {children}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
