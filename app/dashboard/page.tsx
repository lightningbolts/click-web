'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { MapPin, MessageCircle, Settings } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import LoadingScreen from '@/components/LoadingScreen';
import SettingsView from '@/components/SettingsView';

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

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'chats' | 'map' | 'settings'>('chats');
  const [connections, setConnections] = useState<Connection[]>([]);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Fetch user connections
  useEffect(() => {
    if (user) {
      const fetchConnections = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        try {
          const { data, error } = await supabase
            .from('connections')
            .select('*')
            .contains('user_ids', [user.id])
            .order('created', { ascending: false });

          if (error) {
            console.error('Error fetching connections:', error.message || error);
          } else {
            setConnections(data || []);
          }
        } catch (err) {
          console.error('Unexpected error fetching connections:', err);
        }
      };

      fetchConnections();
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'map' && mapContainer.current && !map.current && connections.length > 0) {
      // Initialize map
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [-122.3321, 47.6062], // Seattle default
        zoom: 10,
      });

      // Add markers for each connection
      connections.forEach((connection) => {
        if (connection.geo_location) {
          const el = document.createElement('div');
          el.className = 'marker';
          el.style.width = '20px';
          el.style.height = '20px';
          el.style.borderRadius = '50%';
          el.style.backgroundColor = '#8338EC';
          el.style.border = '2px solid white';
          el.style.cursor = 'pointer';

          new maplibregl.Marker({ element: el })
            .setLngLat([connection.geo_location.longitude, connection.geo_location.latitude])
            .setPopup(
              new maplibregl.Popup({ offset: 25 }).setHTML(
                `<div style="color: black; padding: 8px;">
                  <strong>${connection.semantic_location || 'Connection'}</strong><br/>
                  ${new Date(connection.created).toLocaleDateString()}
                </div>`
              )
            )
            .addTo(map.current!);
        }
      });
    }
  }, [activeTab, connections]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* Tabs */}
      <div className="border-b border-zinc-800">
        <div className="px-6 md:px-12 flex gap-8">
          <button
            onClick={() => setActiveTab('chats')}
            className={`py-4 border-b-2 transition-colors ${
              activeTab === 'chats'
                ? 'border-[#8338EC] text-[#8338EC]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              <span>Chats</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`py-4 border-b-2 transition-colors ${
              activeTab === 'map'
                ? 'border-[#8338EC] text-[#8338EC]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              <span>Connection Map</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-4 border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-[#8338EC] text-[#8338EC]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 md:px-12 py-8">
        {activeTab === 'chats' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-3xl font-bold mb-6">Your Chats</h2>
            {connections.length === 0 ? (
              <div className="glass p-12 rounded-3xl border-zinc-800 text-center">
                <MessageCircle className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Chats Yet</h3>
                <p className="text-zinc-400">
                  Make your first connection to start chatting!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="glass p-6 rounded-2xl border-zinc-800 hover:border-[#8338EC] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {connection.semantic_location || 'Connection'}
                        </h3>
                        <p className="text-zinc-400 text-sm">
                          {new Date(connection.created).toLocaleDateString()} at{' '}
                          {new Date(connection.created).toLocaleTimeString()}
                        </p>
                      </div>
                      <MessageCircle className="w-6 h-6 text-[#8338EC]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'map' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-3xl font-bold mb-6">Connection Map</h2>
            {connections.length === 0 ? (
              <div className="glass p-12 rounded-3xl border-zinc-800 text-center">
                <MapPin className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Connections Yet</h3>
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

        {activeTab === 'settings' && <SettingsView />}
      </div>
    </div>
  );
}

