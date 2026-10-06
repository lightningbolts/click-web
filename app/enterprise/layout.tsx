import type { Metadata } from 'next';

const description =
  'Put your café, bar, gym or campus space on Click: a pin on the map, a Place page, check-ins and events, free. Add Insights per Place.';

export const metadata: Metadata = {
  title: 'Click for Business',
  description,
  openGraph: { title: 'Click for Business', description },
};

export default function EnterpriseLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
