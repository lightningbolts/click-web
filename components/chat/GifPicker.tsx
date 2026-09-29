'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import {
  fetchKlipyGifs,
  klipyPreviewRendition,
  type KlipyGifItem,
} from '@/lib/chat/klipy';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * KLIPY GIF search panel shown above the composer. Empty query shows trending. Results are
 * rendered in the order KLIPY returns them (a KLIPY integration requirement).
 */
export function GifPicker({
  customerId,
  onSelect,
  onClose,
}: {
  customerId: string;
  onSelect: (item: KlipyGifItem, query: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<KlipyGifItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = async (q: string, nextPage: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchKlipyGifs({ query: q, page: nextPage, customerId, signal: controller.signal });
      setItems((prev) => (nextPage === 1 ? result.items : [...prev, ...result.items]));
      setPage(result.page);
      setHasNext(result.hasNext);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError('Couldn’t load GIFs. Try again.');
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(query, 1), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, customerId]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // The composer's GIF button toggles the panel itself.
      if (target?.closest?.('[data-gif-toggle]')) return;
      if (panelRef.current && !panelRef.current.contains(target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      abortRef.current?.abort();
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="GIF search"
      className="absolute bottom-full left-4 right-4 z-50 mb-2 flex max-h-[min(26rem,60vh)] flex-col overflow-hidden rounded-[12px] border border-border-hard bg-surface shadow-xl sm:right-auto sm:w-[22rem]"
    >
      <div className="flex items-center gap-2 border-b border-border-hard px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search KLIPY"
          aria-label="Search KLIPY"
          className="min-w-0 flex-1 bg-transparent text-sm text-on-surface placeholder:text-outline focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-on-surface-variant hover:text-on-surface"
          aria-label="Close GIF search"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error ? (
          <p className="px-2 py-6 text-center text-xs text-on-surface-variant">{error}</p>
        ) : items.length === 0 && !loading ? (
          <p className="px-2 py-6 text-center text-xs text-on-surface-variant">No GIFs found</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {items.map((item) => {
              const preview = klipyPreviewRendition(item);
              if (!preview) return null;
              return (
                <button
                  key={`${item.id}-${item.slug}`}
                  type="button"
                  onClick={() => onSelect(item, query)}
                  className="overflow-hidden rounded-[8px] bg-surface-container ring-primary focus-visible:outline-none focus-visible:ring-2"
                  style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
                  title={item.title || 'Send GIF'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- KLIPY media must load from the URL the API returned */}
                  <img
                    src={preview.url}
                    alt={item.title || 'GIF'}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="block h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" aria-label="Loading GIFs" />
          </div>
        ) : hasNext && !error ? (
          <button
            type="button"
            onClick={() => void load(query, page + 1)}
            className="mt-2 w-full rounded-[8px] border border-border-hard py-1.5 text-xs text-on-surface-variant hover:border-primary hover:text-primary"
          >
            Load more
          </button>
        ) : null}
      </div>
      <p className="border-t border-border-hard px-3 py-1.5 text-right text-[10px] text-on-surface-variant">
        Powered by KLIPY
      </p>
    </div>
  );
}
