'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, 
  MessageCircle, 
  Settings, 
  Users, 
  Clock, 
  QrCode,
  Download,
  BookOpen,
  Sparkles
} from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import LoadingScreen from '@/components/LoadingScreen';
import SettingsView from '@/components/SettingsView';

// Digital Memory Box components
import { ConnectionTable, TimeCapsule, QRIdentityCard } from '@/components/dashboard';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { TimelineChapter } from '@/components/dashboard/TimeCapsule';
import { 
  mockConnections, 
  mockChapters, 
  downloadCSV,
  generateChaptersFromConnections 
} from '@/lib/dashboard/mockData';

interface Connection {
  id: string;
  created: number;
  geo_location: {
    latitude: number;
    longitude: number;
  };
  semantic_location?: string;
  user_ids: string[];
}

type DashboardTab = 'memory' | 'map' | 'identity' | 'settings';

interface DashboardViewProps {
  user: any;
}

/**
 * DashboardView - The Digital Memory Box experience
 * Combines connections, timeline, map, QR identity, and settings
 */
export default function DashboardView({ user }: DashboardViewProps) {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('memory');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionRecords, setConnectionRecords] = useState<ConnectionRecord[]>([]);
  const [chapters, setChapters] = useState<TimelineChapter[]>([]);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  // Fetch user connections
  useEffect(() => {
    if (user) {
      const fetchConnections = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) {
          // Use mock data if no supabase
          setConnectionRecords(mockConnections);
          setChapters(mockChapters);
          return;
        }

        try {
          const { data, error } = await supabase
            .from('connections')
            .select('*')
            .contains('user_ids', [user.id])
            .order('created', { ascending: false });

          if (error) {
            console.error('Error fetching connections:', error.message || error);
            // Fall back to mock data
            setConnectionRecords(mockConnections);
            setChapters(mockChapters);
          } else if (data && data.length > 0) {
            setConnections(data);
            
            // Transform to ConnectionRecord format
            const records: ConnectionRecord[] = data.map((conn: any) => ({
              id: conn.id,
              name: conn.other_user_name || conn.semantic_location || 'Connection',
              dateMet: new Date(conn.created || conn.created_at),
              location: conn.semantic_location || 'Unknown location',
              context: conn.context || undefined,
              status: conn.status || 'kept',
            }));
            
            setConnectionRecords(records);
            setChapters(generateChaptersFromConnections(records));
          } else {
            // No connections yet, use mock for demo
            setConnectionRecords(mockConnections);
            setChapters(mockChapters);
          }
        } catch (err) {
          console.error('Unexpected error fetching connections:', err);
          setConnectionRecords(mockConnections);
          setChapters(mockChapters);
        }
      };

      fetchConnections();
    }
  }, [user]);

  // Initialize map when tab is active
  useEffect(() => {
    if (activeTab === 'map' && mapContainer.current && !map.current) {
      // Initialize map with connections or default view
      const hasGeoConnections = connections.some(c => c.geo_location);
      
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: hasGeoConnections && connections[0]?.geo_location 
          ? [connections[0].geo_location.longitude, connections[0].geo_location.latitude]
          : [-122.3321, 47.6062], // Seattle default
        zoom: 10,
      });

      // Add markers for each connection with location
      connections.forEach((connection) => {
        if (connection.geo_location && map.current) {
          const el = document.createElement('div');
          el.className = 'marker';
          el.style.width = '24px';
          el.style.height = '24px';
          el.style.borderRadius = '50%';
          el.style.background = 'linear-gradient(135deg, #8338EC, #3A86FF)';
          el.style.border = '3px solid white';
          el.style.cursor = 'pointer';
          el.style.boxShadow = '0 0 12px rgba(131, 56, 236, 0.5)';

          new maplibregl.Marker({ element: el })
            .setLngLat([connection.geo_location.longitude, connection.geo_location.latitude])
            .setPopup(
              new maplibregl.Popup({ offset: 25 }).setHTML(
                `<div style="color: white; background: #18181b; padding: 12px; border-radius: 12px; border: 1px solid #27272a;">
                  <strong style="color: #8338EC;">${connection.semantic_location || 'Connection'}</strong><br/>
                  <span style="color: #71717a; font-size: 12px;">${new Date(connection.created).toLocaleDateString()}</span>
                </div>`
              )
            )
            .addTo(map.current);
        }
      });
    }

    return () => {
      if (map.current && activeTab !== 'map') {
        // Don't destroy, just leave it
      }
    };
  }, [activeTab, connections]);

  // Handle CSV export
  const handleExport = useCallback(() => {
    downloadCSV(connectionRecords, `click-connections-${user.email?.split('@')[0] || 'user'}`);
  }, [connectionRecords, user]);

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const tabs: { id: DashboardTab; label: string; icon: any }[] = [
    { id: 'memory', label: 'Memory Box', icon: BookOpen },
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'identity', label: 'QR Identity', icon: QrCode },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[150px] opacity-10" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3A86FF] rounded-full blur-[150px] opacity-10" />
      </div>

      {/* Main content */}
      <div className="relative z-10">
        {/* Welcome header */}
        <div className="px-6 md:px-12 pt-6 pb-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <Sparkles className="w-5 h-5 text-[#8338EC]" />
            <div>
              <h1 className="text-2xl font-bold">
                Welcome back, <span className="text-[#8338EC]">{userName}</span>
              </h1>
              <p className="text-sm text-zinc-500">Your digital memory box</p>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="border-b border-zinc-800 sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-20">
          <div className="px-6 md:px-12 flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-4 px-4 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-[#8338EC]'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8338EC]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 md:px-12 py-8">
          <AnimatePresence mode="wait">
            {/* Memory Box Tab */}
            {activeTab === 'memory' && (
              <motion.div
                key="memory"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                {/* Time Capsule Section */}
                <section className="glass p-6 rounded-3xl border-zinc-800">
                  <TimeCapsule chapters={chapters} />
                </section>

                {/* Connection Table Section */}
                <section className="glass p-6 rounded-3xl border-zinc-800">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                      <Users className="w-5 h-5 text-[#8338EC]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">People I've Met</h2>
                      <p className="text-sm text-zinc-500">Your connection history</p>
                    </div>
                  </div>
                  <ConnectionTable 
                    connections={connectionRecords} 
                    onExport={handleExport}
                  />
                </section>

                {/* Data sovereignty notice */}
                <div className="text-center py-4">
                  <p className="text-xs text-zinc-600">
                    🔒 Your data belongs to you. Export anytime, delete anytime.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Map Tab */}
            {activeTab === 'map' && (
              <motion.div
                key="map"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                    <MapPin className="w-5 h-5 text-[#8338EC]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Connection Map</h2>
                    <p className="text-sm text-zinc-500">Where your memories were made</p>
                  </div>
                </div>

                {connections.length === 0 || !connections.some(c => c.geo_location) ? (
                  <div className="glass p-12 rounded-3xl border-zinc-800 text-center">
                    <MapPin className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No Locations Yet</h3>
                    <p className="text-zinc-400">
                      Your connection map will appear here once you start making connections!
                    </p>
                  </div>
                ) : (
                  <div className="glass rounded-3xl border-zinc-800 overflow-hidden">
                    <div
                      ref={mapContainer}
                      className="w-full h-[600px]"
                    />
                  </div>
                )}
              </motion.div>
            )}

            {/* QR Identity Tab */}
            {activeTab === 'identity' && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="max-w-md mx-auto"
              >
                <QRIdentityCard
                  userId={user.id}
                  userName={user?.user_metadata?.full_name}
                  userEmail={user?.email}
                />
              </motion.div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <SettingsView />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
