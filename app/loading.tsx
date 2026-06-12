export default function RootLoading() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="flex flex-col items-center gap-4" role="status" aria-label="Loading">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}
