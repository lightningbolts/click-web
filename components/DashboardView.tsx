'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Settings,
  Users,
  QrCode,
  BookOpen,
  Sparkles,
  MessageCircle
} from 'lucide-react';
import SettingsView from '@/components/SettingsView';
import { ChatView } from '@/components/chat';
import InterestTagging from '@/components/InterestTagging';

// Digital Memory Box components
import {
  ConnectionTable,
  TimeCapsule,
  QRIdentityCard,
  StatsOverview,
  AchievementBadge,
  MilestoneProgress,
  ConnectionMap
} from '@/components/dashboard';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { TimelineChapter } from '@/components/dashboard/TimeCapsule';
import {
  mockConnections,
  mockChapters,
  downloadCSV,
  generateChaptersFromConnections
} from '@/lib/dashboard/mockData';

type DashboardTab = 'memory' | 'map' | 'chat' | 'identity' | 'settings';

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
  const [connectionRecords, setConnectionRecords] = useState<ConnectionRecord[]>([]);
  const [chapters, setChapters] = useState<TimelineChapter[]>([]);
  /** The connection whose chat is currently open, or null */
  const [selectedConnection, setSelectedConnection] = useState<ConnectionRecord | null>(null);

  // Interest tagging onboarding gate
  const [needsTagging, setNeedsTagging] = useState<boolean | null>(null);
  const [taggingSkipped, setTaggingSkipped] = useState(false);

  useEffect(() => {
    if (user) {
      const checkTags = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) { setNeedsTagging(false); return; }
        try {
          const { data } = await supabase
            .from('users')
            .select('tags')
            .eq('id', user.id)
            .single();
          setNeedsTagging(!data?.tags || data.tags.length === 0);
        } catch {
          setNeedsTagging(false);
        }
      };
      checkTags();
    }
  }, [user]);

  const handleTagsComplete = async (tags: string[]) => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('users').update({ tags }).eq('id', user.id);
    }
    setNeedsTagging(false);
  };

  // Fetch user connections
  useEffect(() => {
    if (user) {
      const fetchConnections = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) {
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
            setConnectionRecords(mockConnections);
            setChapters(mockChapters);
          } else if (data && data.length > 0) {
            const records: ConnectionRecord[] = data.map((conn: any) => ({
              id: conn.id,
              name: conn.other_user_name || conn.semantic_location || 'Connection',
              dateMet: new Date(conn.created || conn.created_at),
              location: conn.semantic_location || 'Unknown location',
              context: conn.context || undefined,
              status: conn.status || 'kept',
              geo_location: conn.geo_location ? {
                latitude: conn.geo_location.latitude,
                longitude: conn.geo_location.longitude,
              } : undefined,
            }));

            setConnectionRecords(records);
            setChapters(generateChaptersFromConnections(records));
          } else {
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

  // Handle CSV export
  const handleExport = useCallback(() => {
    downloadCSV(connectionRecords, `click-connections-${user.email?.split('@')[0] || 'user'}`);
  }, [connectionRecords, user]);

  // Shared handler: open chat for a specific connection
  const handleOpenChat = useCallback((conn: ConnectionRecord) => {
    setSelectedConnection(conn);
    setActiveTab('chat');
  }, []);

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const tabs: { id: DashboardTab; label: string; icon: any }[] = [
    { id: 'memory', label: 'Memory Box', icon: BookOpen },
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'identity', label: 'QR Identity', icon: QrCode },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Interest tagging onboarding overlay */}
      {needsTagging === true && !taggingSkipped && (
        <InterestTagging
          onComplete={handleTagsComplete}
          onSkip={() => setTaggingSkipped(true)}
          canSkip={true}
        />
      )}

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
                  className={`relative py-4 px-4 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id
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
                {/* Stats Overview Section */}
                <section>
                  <StatsOverview
                    totalConnections={connectionRecords.length}
                    thisMonth={connectionRecords.filter(c => {
                      const now = new Date();
                      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                      return c.dateMet >= thisMonth;
                    }).length}
                    streak={7}
                    retentionRate={Math.round((connectionRecords.filter(c => c.status === 'kept').length / Math.max(connectionRecords.length, 1)) * 100)}
                  />
                </section>

                {/* Achievements & Milestones Row */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">Recent Achievements</h3>
                    <AchievementBadge
                      title="Social Butterfly"
                      description="Met 10+ people this month"
                      isNew={true}
                    />
                    <AchievementBadge
                      title="Week Warrior"
                      description="7-day connection streak"
                    />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">Next Milestone</h3>
                    <MilestoneProgress
                      current={connectionRecords.length}
                      target={25}
                      label="Connection Collector"
                      reward="Special badge unlock"
                    />
                  </div>
                </section>

                {/* Time Capsule Section */}
                <section className="glass p-6 rounded-3xl border border-zinc-800">
                  <TimeCapsule chapters={chapters} onConnectionClick={handleOpenChat} />
                </section>

                {/* Connection Table Section */}
                <section className="glass p-6 rounded-3xl border border-zinc-800">
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
                    onSelect={handleOpenChat}
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

                <ConnectionMap connections={connectionRecords} onConnectionClick={handleOpenChat} />
              </motion.div>
            )}

            {/* Chat Tab */}
            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="h-[calc(100vh-180px)]"
              >
                {selectedConnection ? (
                  <ChatView
                    connection={selectedConnection}
                    currentUserId={user.id}
                    otherUserName={selectedConnection.name}
                    onClose={() => setSelectedConnection(null)}
                  />
                ) : (
                  /* Connection picker list */
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                        <MessageCircle className="w-5 h-5 text-[#8338EC]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">Messages</h2>
                        <p className="text-sm text-zinc-500">Chat with your connections</p>
                      </div>
                    </div>

                    {connectionRecords.length === 0 ? (
                      <div className="glass p-12 rounded-3xl border border-zinc-800 text-center">
                        <MessageCircle className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold mb-2">No Conversations Yet</h3>
                        <p className="text-zinc-400">
                          Start meeting people and your chats will appear here!
                        </p>
                      </div>
                    ) : (
                      <div className="glass rounded-3xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800/50">
                        {connectionRecords.filter(c => c.status === 'kept' || c.status === 'pending').map((conn) => (
                          <motion.button
                            key={conn.id}
                            whileHover={{ backgroundColor: 'rgba(131, 56, 236, 0.05)' }}
                            whileTap={{ scale: 0.995 }}
                            onClick={() => setSelectedConnection(conn)}
                            className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
                          >
                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] flex items-center justify-center text-sm font-bold shrink-0">
                              {conn.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-white truncate">{conn.name}</p>
                              <p className="text-xs text-zinc-500 truncate">
                                {conn.location} · {conn.dateMet.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                            {conn.context && (
                              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-[#8338EC]/10 text-[#8338EC] border border-[#8338EC]/20">
                                {conn.context}
                              </span>
                            )}
                            <MessageCircle className="w-4 h-4 text-zinc-600 shrink-0" />
                          </motion.button>
                        ))}
                      </div>
                    )}
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