'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ds/Popover';
import { Skeleton } from '@/components/ds/Skeleton';
import { useTheme } from '@/lib/theme/ThemeProvider';

/** emoji-mart and its ~400 KB dataset load only when the picker opens (spec §11.2). */
const loadEmojiData = () => import('@emoji-mart/data').then((m) => m.default);
const Picker = dynamic(() => import('@emoji-mart/react').then((m) => m.default), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-[352px] max-w-[calc(100vw-24px)]" />,
});

/** The full emoji picker in a popover, behind the action bar's `+` (spec §7.2). */
export function EmojiPopover({
  open,
  onOpenChange,
  onSelect,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string) => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="center" side="top" className="overflow-hidden p-0">
        {open ? (
          <Picker
            data={loadEmojiData}
            theme={theme}
            autoFocus
            previewPosition="none"
            skinTonePosition="search"
            maxFrequentRows={2}
            onEmojiSelect={(e: { native: string }) => {
              onSelect(e.native);
              onOpenChange(false);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
