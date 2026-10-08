'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/ticketing/money';
import { fetchTicketDetail } from '@/lib/ticketing/ticketingClient';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** The receipt behind a ticket, folded away until asked for (then fetched once). */
export function OrderDetails({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { data, error, mutate } = useSWR(open ? ['ticket-detail', ticketId] : null, () => fetchTicketDetail(ticketId), {
    revalidateOnFocus: false,
  });
  const order = data?.order;

  return (
    <div className="rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="type-body-strong flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left text-fg"
      >
        Order details
        <ChevronDown
          size={16}
          strokeWidth={2}
          aria-hidden
          className={cn('shrink-0 text-fg-tertiary transition-transform duration-[var(--d-fast)]', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div id={panelId} className="px-4 pb-4">
          {order ? (
            <dl className="type-meta tabular space-y-1.5 text-fg-secondary" data-testid="order-details">
              {order.items.map((item) => (
                <div key={item.tier_name} className="flex justify-between gap-3">
                  <dt className="min-w-0 truncate">
                    {item.quantity} × {item.tier_name}
                  </dt>
                  <dd className="shrink-0">{formatMoney(item.quantity * item.unit_amount, order.currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <dt>Fees</dt>
                <dd>None</dd>
              </div>
              <div className="type-body-strong flex justify-between gap-3 border-t border-hairline pt-1.5 text-fg">
                <dt>Total</dt>
                <dd>{formatMoney(order.total_amount, order.currency)}</dd>
              </div>
              {order.refunded_amount > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt>Refunded</dt>
                  <dd>−{formatMoney(order.refunded_amount, order.currency)}</dd>
                </div>
              ) : null}
              {order.paid_at ? (
                <div className="flex justify-between gap-3 pt-1 text-fg-tertiary">
                  <dt>{order.total_amount > 0 ? 'Paid' : 'Claimed'}</dt>
                  <dd>{dateFormat.format(Date.parse(order.paid_at))}</dd>
                </div>
              ) : null}
            </dl>
          ) : error ? (
            <div className="flex items-center justify-between gap-3">
              <p className="type-meta text-fg-secondary">Couldn’t load your order.</p>
              <Button size="sm" variant="plain" onClick={() => void mutate()}>
                Retry
              </Button>
            </div>
          ) : (
            <div aria-hidden className="space-y-2">
              <Skeleton rounded="sm" className="h-4 w-full" />
              <Skeleton rounded="sm" className="h-4 w-2/3" />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
