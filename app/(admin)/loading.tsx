/** Skeleton for the admin console while server-side dashboard data loads. */
export default function AdminLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10"
      role="status"
      aria-label="Loading admin dashboard"
    >
      <div className="grid flex-1 animate-pulse gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="h-64 rounded-2xl border border-zinc-800 bg-zinc-900/60" />
        <div className="space-y-4">
          <div className="h-10 w-72 rounded bg-zinc-800" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl border border-zinc-800 bg-zinc-900/60" />
            ))}
          </div>
          <div className="h-96 rounded-2xl border border-zinc-800 bg-zinc-900/60" />
        </div>
      </div>
      <span className="sr-only">Loading admin dashboard…</span>
    </div>
  );
}
