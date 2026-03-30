import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Enterprise & institutions | Click',
  description:
    'Click for teams, venues, and campuses. Tap-to-connect identity plus Business Insights: social activity, heatmaps, tribe analysis, live metrics, and visibility into how staff and guests actually connect.',
};

export default function EnterpriseLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
