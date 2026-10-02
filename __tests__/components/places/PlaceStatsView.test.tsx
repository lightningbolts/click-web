import { render, screen } from '@testing-library/react';
import PlaceStatsView from '@/components/places/PlaceStatsView';
import { mockPlaceStats } from '@/lib/insights/mockData';
import type { PlaceStats } from '@/lib/server/places/stats';

jest.mock('@/lib/theme/insightsChartTheme', () => ({
  useInsightsChartTheme: () => ({ grid: '#eee', muted: '#999', axis: '#ccc', tooltipBg: '#fff', tooltipBorder: '#ddd', tooltipText: '#111', cursor: '#f5f5f5', primary: '#7c3aed' }),
}));

describe('PlaceStatsView', () => {
  it('renders tiles and states n on every chart, without thresholds', () => {
    const basic: PlaceStats = { ...(mockPlaceStats as PlaceStats), daily: undefined, pulse_by_daypart: undefined };
    render(<PlaceStatsView stats={{ ...basic, totals: { ...basic.totals, check_ins: 1 } }} />);
    expect(screen.getByText('Check-ins')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getAllByText(/^n = \d+$/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByLabelText('Check-ins by local day and hour')).toBeTruthy();
  });

  it('renders the full detail sections', () => {
    render(<PlaceStatsView stats={mockPlaceStats as PlaceStats} />);
    expect(screen.getByText('Median stay')).toBeTruthy();
    expect(screen.getByText('Pulse by time of day')).toBeTruthy();
  });
});
