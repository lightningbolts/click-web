'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SegmentedControl, type Segment } from '@/components/ds/SegmentedControl';

/**
 * A SegmentedControl whose value lives in one query param (spec §10.1: URLs are state). The
 * first segment is the default and is left out of the URL.
 */
export function UrlSegmented<T extends string>({
  param,
  value,
  segments,
  label,
  size,
}: {
  param: string;
  value: T;
  segments: readonly Segment<T>[];
  label: string;
  size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <SegmentedControl<T>
      label={label}
      value={value}
      size={size}
      segments={segments}
      onChange={(v) => {
        const next = new URLSearchParams(search.toString());
        if (v === segments[0].value) next.delete(param);
        else next.set(param, v);
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
    />
  );
}
