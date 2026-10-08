/** Money display for integer cents. Zero always reads "Free". */

function formatter(currency: string, wholeOnly: boolean): Intl.NumberFormat {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: wholeOnly ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** "$15.00", "$12.50", "Free". */
export function formatMoney(cents: number, currency: string): string {
  if (cents === 0) return 'Free';
  return formatter(currency, false).format(cents / 100);
}

/** Compact price for "from" labels: "$12", "$12.50", "Free". */
export function formatFromPrice(cents: number, currency: string): string {
  if (cents === 0) return 'Free';
  return formatter(currency, cents % 100 === 0).format(cents / 100);
}
