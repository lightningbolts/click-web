'use client';

import { Download, ExternalLink, FileText, Paperclip } from 'lucide-react';
import type { FileItem } from '@/lib/userProfile/profileModalTypes';
import { formatFileSize } from '@/lib/userProfile/profileMediaItems';
import { EmptyTabState } from '@/components/userProfile/ProfileModalPrimitives';

export function FilesTab({
  fileItems,
  tabsLoading,
  openFileItem,
  downloadFileItem,
}: {
  fileItems: FileItem[];
  tabsLoading: boolean;
  openFileItem: (item: FileItem) => Promise<void>;
  downloadFileItem: (item: FileItem) => Promise<void>;
}) {
  return (
    <section role="tabpanel" aria-label="Files">
      {fileItems.length === 0 && tabsLoading ? (
        <EmptyTabState
          Icon={Paperclip}
          title="Loading shared files"
          body="Fetching attachment metadata for this chat."
        />
      ) : fileItems.length === 0 ? (
        <EmptyTabState
          Icon={Paperclip}
          title="No shared files"
          body="Attachments sent in chat will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {fileItems.map((f) => (
            <li key={f.id}>
              <div className="flex w-full items-start gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5 text-left hover:border-primary">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-on-surface">{f.fileName}</p>
                  <p className="mt-0.5 text-[11px] text-on-surface-variant">
                    {formatFileSize(f.sizeBytes)} · {f.mimeType}
                  </p>
                  <p className="text-[11px] text-on-surface-variant">{f.timestamp}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      void openFileItem(f);
                    }}
                    className="rounded-[8px] p-1.5 text-on-surface-variant hover:bg-surface hover:text-on-surface"
                    aria-label="Open file"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void downloadFileItem(f);
                    }}
                    className="rounded-[8px] p-1.5 text-on-surface-variant hover:bg-surface hover:text-on-surface"
                    aria-label="Download file"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
