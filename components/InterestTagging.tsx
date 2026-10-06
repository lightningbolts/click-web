'use client';

import { useState } from 'react';
import { Button } from '@/components/ds/Button';
import { Dialog } from '@/components/ds/Dialog';
import { InterestPicker, missingInterests } from '@/components/interests/InterestPicker';

export { INTEREST_CATEGORIES, MIN_TAGS, type InterestCategory } from '@/lib/interests/categories';

/** First-run "What are you into?" (onboarding gate), on the same picker as Settings. */
export default function InterestTagging({
  onComplete,
  onSkip,
  canSkip = true,
  initialTags = [],
}: {
  onComplete: (tags: string[]) => void;
  onSkip: () => void;
  canSkip?: boolean;
  initialTags?: string[];
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && canSkip) onSkip();
      }}
      title="What are you into?"
      description="Pick a few, so Click can suggest people and events. You can change these in Settings."
      size="md"
      hideClose={!canSkip}
      testId="interest-tagging"
      footer={
        <>
          {canSkip ? (
            <Button variant="plain" onClick={onSkip}>
              Skip for now
            </Button>
          ) : null}
          <Button variant="primary" disabled={missingInterests(tags) > 0} onClick={() => onComplete(tags)}>
            Continue
          </Button>
        </>
      }
    >
      <InterestPicker tags={tags} onChange={setTags} />
    </Dialog>
  );
}
