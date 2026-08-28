'use client';

import { Download, ExternalLink, Image as ImageIcon, Maximize2 } from 'lucide-react';
import type { MediaItem } from '@/lib/userProfile/profileModalTypes';
import { EmptyTabState } from '@/components/userProfile/ProfileModalPrimitives';

export function MediaTab({
  cryptoUnlockError,
  mediaItems,
  imageItems,
  audioItems,
  tabsLoading,
  resolvedMediaUrls,
  openMediaItem,
  downloadMediaItem,
}: {
  cryptoUnlockError: string | null;
  mediaItems: MediaItem[];
  imageItems: MediaItem[];
  audioItems: MediaItem[];
  tabsLoading: boolean;
  resolvedMediaUrls: Record<string, string>;
  openMediaItem: (item: MediaItem) => void;
  downloadMediaItem: (item: MediaItem) => Promise<void>;
}) {
  return (
    <section role="tabpanel" aria-label="Media">
      {cryptoUnlockError ? (
        <p className="mb-3 rounded-[10px] border border-border-hard bg-surface-container px-3 py-2 text-xs text-error">
          {cryptoUnlockError}
        </p>
      ) : null}
      {mediaItems.length === 0 && tabsLoading ? (
        <EmptyTabState
          Icon={ImageIcon}
          title="Loading shared media"
          body="Pulling image and audio history for this conversation."
        />
      ) : mediaItems.length === 0 ? (
        <EmptyTabState
          Icon={ImageIcon}
          title="No shared media"
          body="Photos and voice notes you exchange in chat will appear here."
        />
      ) : (
        <div className="space-y-4">
          {imageItems.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {imageItems.map((m) => (
                <div key={m.id} className="group relative aspect-square overflow-hidden">
                  {resolvedMediaUrls[m.id] ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openMediaItem(m)}
                        className="block h-full w-full"
                        aria-label="Expand image"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolvedMediaUrls[m.id]}
                          alt={m.caption ?? ''}
                          width={400}
                          height={400}
                          decoding="async"
                          className="h-full w-full rounded-[8px] border border-border-hard object-cover"
                        />
                      </button>
                      <div className="pointer-events-none absolute inset-0 rounded-[8px] bg-black/0 transition group-hover:bg-black/30" />
                      <div className="absolute bottom-1 right-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={() => openMediaItem(m)}
                          className="pointer-events-auto rounded-[8px] border border-border-hard bg-surface p-1 text-on-surface hover:bg-surface-container"
                          aria-label="Open image"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadMediaItem(m)}
                          className="pointer-events-auto rounded-[8px] border border-border-hard bg-surface p-1 text-on-surface hover:bg-surface-container"
                          aria-label="Download image"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex aspect-square h-full w-full items-center justify-center rounded-[8px] border border-border-hard bg-surface-container text-[11px] font-medium text-on-surface-variant">
                      Secured image
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {audioItems.length > 0 && (
            <ul className="flex flex-col gap-2">
              {audioItems.map((m) => {
                const audioUrl = resolvedMediaUrls[m.id];
                return (
                  <li key={m.id} className="rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-on-surface">Voice note</p>
                      <div className="flex items-center gap-1">
                        {audioUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() => openMediaItem(m)}
                              className="rounded-[8px] p-1 text-on-surface-variant hover:bg-surface hover:text-on-surface"
                              aria-label="Open audio"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadMediaItem(m)}
                              className="rounded-[8px] p-1 text-on-surface-variant hover:bg-surface hover:text-on-surface"
                              aria-label="Download audio"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {audioUrl ? (
                      <audio controls preload="metadata" src={audioUrl} className="mt-2 w-full" />
                    ) : (
                      <div className="mt-2 rounded-[8px] border border-border-hard bg-surface px-3 py-2 text-xs text-on-surface-variant">
                        Secured audio
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
