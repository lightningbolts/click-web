'use client';

import { SegmentedControl } from '@/components/ds/SegmentedControl';
import { useTheme, type ThemePreference } from '@/lib/theme/ThemeProvider';

export const APPEARANCE_SEGMENTS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

/** System / Light / Dark (spec §7.8); the same control sits inline on Me. */
export function AppearanceControl({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <SegmentedControl
      label="Appearance"
      segments={APPEARANCE_SEGMENTS}
      value={preference}
      onChange={setPreference}
      fullWidth
      className={className}
    />
  );
}
