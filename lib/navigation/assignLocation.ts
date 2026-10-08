/** Full-page navigation to another site (Stripe's hosted pages). A seam so tests can observe it. */
export function assignLocation(url: string): void {
  window.location.assign(url);
}
