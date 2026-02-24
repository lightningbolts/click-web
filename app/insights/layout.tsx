import BusinessInsightsShell from '@/components/insights/BusinessInsightsShell';

/**
 * InsightsLayout — wraps all /insights/* pages with the business sub-navigation shell.
 * The global Navbar (from app/layout.tsx) still renders above this.
 */
export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <BusinessInsightsShell venueName="The Neon Lounge">
      {children}
    </BusinessInsightsShell>
  );
}
