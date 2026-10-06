import Link from "next/link";
import { PAGE_COLUMN_CLASS } from "@/lib/shell/pageColumn";
import { cn } from "@/lib/cn";

/** Branded 404 on the shared page column (the framework default ignores the theme tokens). */
export default function NotFound() {
  return (
    <div className={cn(PAGE_COLUMN_CLASS, "flex flex-1 flex-col items-center justify-center py-24 text-center")}>
      <p className="text-sm font-bold uppercase tracking-wide text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">This page isn&apos;t here</h1>
      <p className="mt-3 max-w-md text-base text-fg-secondary">
        The link may be old, or the event may have been removed by its host.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="fc-btn-primary inline-flex h-11 items-center px-5">
          Go home
        </Link>
        <Link href="/events" className="fc-btn-secondary inline-flex h-11 items-center px-5">
          Browse events
        </Link>
      </div>
    </div>
  );
}
