'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { SegmentedControl } from '@/components/ds/SegmentedControl';
import { Sheet } from '@/components/ds/Sheet';
import { TextField } from '@/components/ds/TextField';
import { toast } from '@/components/ds/Toast';
import { encodeDropImage } from '@/lib/drops/encodeDropImage';
import { postHomeAction } from '@/lib/home/postHomeAction';
import { SHARED_DROP_CAPTION_MAX } from '@/lib/api/schemas/drops';

type Audience = 'all' | 'core';

/** Share a photo that develops later for your Clicks (POST /api/me/shared-drops). */
export function AddDropSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const inputId = useId();
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const file = picked?.file ?? null;
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Release each preview URL once it's replaced or the sheet unmounts.
  useEffect(() => (picked ? () => URL.revokeObjectURL(picked.url) : undefined), [picked]);

  const reset = () => {
    setPicked(null);
    setCaption('');
    setError('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const encoded = await encodeDropImage(file);
      await postHomeAction('/api/me/shared-drops', {
        client_drop_id: crypto.randomUUID(),
        audience,
        caption: caption.trim() || undefined,
        ...encoded,
      });
      toast.success('Dropped. It develops for your Clicks later.');
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t share this drop.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Add a drop"
      description="A photo your Clicks see pixelated until it develops."
      footer={
        <Button type="submit" form="add-drop-form" size="lg" fullWidth loading={busy} disabled={!file}>
          Drop it
        </Button>
      }
    >
      <form id="add-drop-form" onSubmit={onSubmit} className="flex flex-col gap-5">
        <label
          htmlFor={inputId}
          className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-fill-subtle text-fg-secondary hover:bg-hover"
        >
          {picked ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={picked.url} alt="Selected photo" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="type-body-strong flex flex-col items-center gap-2">
              <ImagePlus size={28} strokeWidth={1.75} aria-hidden />
              Choose a photo
            </span>
          )}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const next = e.target.files?.[0];
              setPicked(next ? { file: next, url: URL.createObjectURL(next) } : null);
            }}
          />
        </label>
        <TextField
          label="Caption"
          placeholder="Optional"
          value={caption}
          maxLength={SHARED_DROP_CAPTION_MAX}
          onChange={(e) => setCaption(e.target.value)}
        />
        <div>
          <p className="type-meta mb-2 font-semibold text-fg-secondary">Who sees it</p>
          <SegmentedControl
            label="Audience"
            fullWidth
            value={audience}
            onChange={setAudience}
            segments={[
              { value: 'all', label: 'All Clicks' },
              { value: 'core', label: 'Core' },
            ]}
          />
        </div>
        {error ? (
          <InlineNotice variant="destructive" live>
            {error}
          </InlineNotice>
        ) : null}
      </form>
    </Sheet>
  );
}
