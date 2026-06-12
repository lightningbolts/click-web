/** Skeleton for /insights/* while server data and the dashboard chunk load. */
export default function InsightsLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6" role="status" aria-label="Loading insights">
      <div className="animate-pulse space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-zinc-800" />
          <div className="h-8 w-64 rounded bg-zinc-800" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl border border-zinc-800 bg-zinc-900/60" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-72 rounded-2xl border border-zinc-800 bg-zinc-900/60" />
          <div className="h-72 rounded-2xl border border-zinc-800 bg-zinc-900/60" />
        </div>
      </div>
      <span className="sr-only">Loading insights…</span>
    </div>
  );
}
