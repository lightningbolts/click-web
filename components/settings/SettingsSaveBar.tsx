'use client';

import { Button } from '@/components/ds/Button';
import { cn } from '@/lib/cn';

/**
 * Sticky "Save changes" footer that appears only while a form is dirty (spec §7.8), with
 * "Discard" beside it. Sits above the mobile tab bar.
 */
export function SettingsSaveBar({
  dirty,
  saving,
  onDiscard,
  disabled,
  formId,
}: {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  disabled?: boolean;
  /** The form this submits. */
  formId: string;
}) {
  if (!dirty && !saving) return null;
  return (
    <div
      className={cn(
        'material-glass sticky bottom-[calc(var(--tabbar-height)+16px)] z-20 mt-6 flex items-center justify-end gap-2 rounded-pill p-2 shadow-overlay',
        'animate-[ds-appear_var(--d-base)_var(--ease)]',
      )}
      data-testid="settings-save-bar"
    >
      <span className="type-meta mr-auto pl-3 text-fg-secondary">Unsaved changes</span>
      <Button variant="plain" size="sm" onClick={onDiscard} disabled={saving}>
        Discard
      </Button>
      <Button type="submit" form={formId} variant="primary" size="sm" loading={saving} disabled={disabled}>
        Save changes
      </Button>
    </div>
  );
}
