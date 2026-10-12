"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchField, Select, Spinner } from "@/components/ds";
import { SCHOOL_YEARS, WEEKLY_HOURS } from "@/lib/careers/application";
import {
  APPLICATION_STATUSES,
  LIST_SORTS,
  listQuery,
  type ListParams,
} from "@/lib/careers/recruiting";

const SEARCH_DEBOUNCE_MS = 300;

/** Search, filters and sort live in the URL, so the server renders each page and links share. */
export function ListControls({
  params,
  interests,
}: {
  params: ListParams;
  interests: readonly { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.q);
  const [urlQuery, setUrlQuery] = useState(params.q);
  // Follow the URL when it changes elsewhere (Clear filters, Back), not while typing.
  if (params.q !== urlQuery) {
    setUrlQuery(params.q);
    if (params.q !== query.trim()) setQuery(params.q);
  }

  const go = (patch: Partial<ListParams>) =>
    startTransition(() => {
      router.replace(`/admin/recruiting${listQuery(params, { ...patch, page: 1 })}`, { scroll: false });
    });

  useEffect(() => {
    if (query.trim() === params.q) return;
    const timer = setTimeout(() => go({ q: query.trim() }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Only the typed text should restart the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const filter = (
    label: string,
    key: "status" | "year" | "interest" | "hours",
    all: string,
    options: readonly { value: string; label: string }[],
  ) => (
    <Select label={label} hideLabel value={params[key]} onChange={(e) => go({ [key]: e.target.value })}>
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-3" aria-busy={pending || undefined}>
      <div className="flex items-center gap-3">
        <SearchField
          label="Search applicants by name or email"
          placeholder="Search name or email"
          value={query}
          onValueChange={setQuery}
          className="flex-1"
        />
        <span className="flex w-5 shrink-0 justify-center text-fg-tertiary" aria-hidden>
          {pending ? <Spinner /> : null}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {filter("Status", "status", "All statuses", APPLICATION_STATUSES)}
        {filter("Year in school", "year", "All years", SCHOOL_YEARS)}
        {filter("Area of interest", "interest", "All interests", interests)}
        {filter("Weekly availability", "hours", "Any availability", WEEKLY_HOURS)}
        <Select
          label="Sort"
          hideLabel
          value={params.sort}
          onChange={(e) => go({ sort: e.target.value as ListParams["sort"] })}
          className="col-span-2 md:col-span-1"
        >
          {LIST_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
