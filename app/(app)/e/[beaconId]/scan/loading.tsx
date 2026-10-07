/** The scanner's black stage, so opening it doesn't flash the page behind. */
export default function EventScanLoading() {
  return (
    <div className="fixed inset-0 z-[70] bg-black" role="status" aria-label="Opening the scanner">
      <span className="sr-only">Opening the scanner…</span>
    </div>
  );
}
