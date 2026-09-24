export function safeTicketingReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !/^\/e\/[0-9a-f-]{36}\/manage(?:#ticketing)?$/i.test(value))
    return '/events';
  return value;
}
