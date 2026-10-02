export function money(amount: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
}
export function salesLabel(
  status: string,
  start: string | null,
  end: string | null,
  now = Date.now(),
) {
  if (status !== 'sales_open')
    return (
      (
        {
          draft: 'Tickets coming soon',
          disabled: 'Tickets unavailable',
          sales_paused: 'Sales paused',
          sales_closed: 'Sales closed',
        } as Record<string, string>
      )[status] ?? 'Tickets coming soon'
    );
  if (start && Date.parse(start) > now) return 'Sales scheduled';
  if (end && Date.parse(end) <= now) return 'Sales ended';
  return 'Tickets available';
}
