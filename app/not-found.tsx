import Link from "next/link";
import { cn } from "@/lib/cn";

/** Branded 404 on the shared page column (the framework default ignores the theme tokens). */
export default function NotFound() {
  return (
    <div className={cn('container-content', "flex flex-1 flex-col items-center justify-center py-24 text-center")}>
      <p className="text-sm font-bold uppercase tracking-wide text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">This page isn&apos;t here</h1>
      <p className="mt-3 max-w-md text-base text-fg-secondary">
        The link may be old, or the event may have been removed by its host.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-pill bg-action font-semibold text-on-action transition-colors hover:bg-action-hover active:bg-action-pressed disabled:cursor-not-allowed disabled:opacity-40 inline-flex h-11 items-center px-5">
          Go home
        </Link>
        <Link href="/events" className="inline-flex items-center justify-center gap-2 rounded-pill bg-fill-subtle font-semibold text-fg transition-colors hover:bg-fill-strong disabled:cursor-not-allowed disabled:opacity-40 inline-flex h-11 items-center px-5">
          Browse events
        </Link>
      </div>
    </div>
  );
}
