'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { Users, Calendar, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import LoadingScreen from '@/components/LoadingScreen';

interface InsightsResponse {
  totalConnections: number;
  hourlyDistribution: number[];
  dailyData: { date: string; count: number }[];
  peakHour: number;
  retentionRate: string;
  busiestDay: string;
  status?: string;
  message?: string;
}

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    // @ts-ignore
    error.info = res.json();
    // @ts-ignore
    error.status = res.status;
    throw error;
  }
  return res.json();
});

export default function InsightsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const { data, error, isLoading } = useSWR<InsightsResponse>(
    user ? '/api/insights/venue' : null,
    fetcher
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  if (authLoading || (isLoading && !error)) {
    return <LoadingScreen />;
  }

  if (error) {
    // Handle 403 Forbidden (Not a verified business)
    if (error.status === 403) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
          <div className="glass p-8 rounded-3xl border-zinc-800 max-w-md text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
            <p className="text-zinc-400 mb-6">
              This dashboard is only available to verified business partners.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-xl transition-colors"
            >
              Go to User Dashboard
            </button>
          </div>
        </div>
      );
    }
    
    // Handle Insufficient Data (Custom status from API) or other errors
    // Note: API returns 200 for insufficient_data with a status field, 
    // but if it returned an error code, it would be caught here.
    // Let's check data.status below.
  }

  if (data?.status === 'insufficient_data') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="glass p-8 rounded-3xl border-zinc-800 max-w-md text-center">
          <Users className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Insufficient Data</h1>
          <p className="text-zinc-400 mb-6">
            {data.message || "We need at least 5 connections to generate insights to protect user privacy."}
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-xl transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Prepare data for charts
  const hourlyData = data?.hourlyDistribution?.map((count: number, hour: number) => ({
    hour: `${hour}:00`,
    count,
  })) || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12">
          <h1 className="text-4xl font-bold mb-2">Click Insights</h1>
          <p className="text-zinc-400">Real-time analytics for your venue</p>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="glass p-6 rounded-3xl border-zinc-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-[#8338EC]/20 rounded-xl">
                <Users className="w-6 h-6 text-[#8338EC]" />
              </div>
              <span className="text-zinc-400">Total Foot Traffic</span>
            </div>
            <div className="text-4xl font-bold">{data?.totalConnections || 0}</div>
            <div className="text-sm text-zinc-500 mt-2">Last 30 days</div>
          </div>

          <div className="glass p-6 rounded-3xl border-zinc-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-green-500/20 rounded-xl">
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
              <span className="text-zinc-400">Retention Rate</span>
            </div>
            <div className="text-4xl font-bold">{data?.retentionRate || 'N/A'}</div>
            <div className="text-sm text-zinc-500 mt-2">Returning visitors</div>
          </div>

          <div className="glass p-6 rounded-3xl border-zinc-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-orange-500/20 rounded-xl">
                <Calendar className="w-6 h-6 text-orange-500" />
              </div>
              <span className="text-zinc-400">Busiest Day</span>
            </div>
            <div className="text-2xl font-bold">{data?.busiestDay || 'N/A'}</div>
            <div className="text-sm text-zinc-500 mt-2">Highest activity</div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Chart - Social Activity */}
          <div className="lg:col-span-2 glass p-8 rounded-3xl border-zinc-800">
            <h3 className="text-xl font-bold mb-6">Social Activity</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.dailyData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#666" 
                    tick={{ fill: '#666' }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke="#666" tick={{ fill: '#666' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#8338EC" 
                    strokeWidth={3}
                    dot={{ fill: '#8338EC', strokeWidth: 2 }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Secondary Chart - Popular Times */}
          <div className="glass p-8 rounded-3xl border-zinc-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Popular Times</h3>
              <Clock className="w-5 h-5 text-zinc-500" />
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <XAxis 
                    dataKey="hour" 
                    stroke="#666" 
                    tick={{ fill: '#666', fontSize: 12 }} 
                    interval={3}
                  />
                  <Tooltip 
                    cursor={{ fill: '#27272a' }}
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {hourlyData.map((entry: any, index: number) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={index === data?.peakHour ? '#8338EC' : '#3f3f46'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-center text-sm text-zinc-400">
              Peak time is around <span className="text-white font-bold">{data?.peakHour}:00</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
