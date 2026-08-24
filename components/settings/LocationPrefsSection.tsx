'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import * as Switch from '@radix-ui/react-switch';
import { MapPin, Map, Shield } from 'lucide-react';

export default function LocationPrefsSection() {
  const { user } = useAuth();
  const [locationPrefs, setLocationPrefs] = useState({
    location_connection_snap_enabled: true,
    location_show_on_map_enabled: true,
    location_include_in_insights_enabled: true,
  });
  const [locationPrefsLoading, setLocationPrefsLoading] = useState(false);
  const [locationPrefsMessage, setLocationPrefsMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from('users')
      .select('location_connection_snap_enabled, location_show_on_map_enabled, location_include_in_insights_enabled')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setLocationPrefs({
            location_connection_snap_enabled: data.location_connection_snap_enabled ?? true,
            location_show_on_map_enabled: data.location_show_on_map_enabled ?? true,
            location_include_in_insights_enabled: data.location_include_in_insights_enabled ?? true,
          });
        }
      });
  }, [user?.id]);

  return (
    <div className="fc-card p-8 rounded-[16px] border border-border-hard">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Your Data</h3>
          <p className="text-on-surface-variant text-sm">Location is enabled by default so your map and anonymous trends work right away. Turn off anything you do not want. Ghost mode (on mobile) overrides these when active.</p>
        </div>
      </div>

      <div className="space-y-4">
        <LocationPrefToggleRow
          icon={<MapPin className="w-4 h-4 text-primary" />}
          title="Connection location snap"
          description="Records GPS at the moment you tap (not continuous tracking)"
          checked={locationPrefs.location_connection_snap_enabled}
          disabled={locationPrefsLoading}
          onChange={async (checked) => {
            setLocationPrefsLoading(true);
            setLocationPrefsMessage({ type: '', text: '' });
            const next = { ...locationPrefs, location_connection_snap_enabled: checked };
            setLocationPrefs(next);
            const supabase = getSupabaseClient();
            if (supabase && user?.id) {
              const { error } = await supabase.from('users').update({ location_connection_snap_enabled: checked }).eq('id', user.id);
              if (error) setLocationPrefsMessage({ type: 'error', text: error.message });
              else setLocationPrefsMessage({ type: 'success', text: 'Saved.' });
            }
            setLocationPrefsLoading(false);
          }}
        />
        <LocationPrefToggleRow
          icon={<Map className="w-4 h-4 text-primary" />}
          title="Show on my Memory Map"
          description="Personal only, never shared with others"
          checked={locationPrefs.location_show_on_map_enabled}
          disabled={locationPrefsLoading}
          onChange={async (checked) => {
            setLocationPrefsLoading(true);
            setLocationPrefsMessage({ type: '', text: '' });
            const next = { ...locationPrefs, location_show_on_map_enabled: checked };
            setLocationPrefs(next);
            const supabase = getSupabaseClient();
            if (supabase && user?.id) {
              const { error } = await supabase.from('users').update({ location_show_on_map_enabled: checked }).eq('id', user.id);
              if (error) setLocationPrefsMessage({ type: 'error', text: error.message });
              else setLocationPrefsMessage({ type: 'success', text: 'Saved.' });
            }
            setLocationPrefsLoading(false);
          }}
        />
        <LocationPrefToggleRow
          icon={<Shield className="w-4 h-4 text-primary" />}
          title="Include in business insights"
          description="Anonymous venue/campus trends are on by default. Turn this off if you do not want to be included."
          checked={locationPrefs.location_include_in_insights_enabled}
          disabled={locationPrefsLoading}
          onChange={async (checked) => {
            setLocationPrefsLoading(true);
            setLocationPrefsMessage({ type: '', text: '' });
            const next = { ...locationPrefs, location_include_in_insights_enabled: checked };
            setLocationPrefs(next);
            const supabase = getSupabaseClient();
            if (supabase && user?.id) {
              const { error } = await supabase.from('users').update({ location_include_in_insights_enabled: checked }).eq('id', user.id);
              if (error) setLocationPrefsMessage({ type: 'error', text: error.message });
              else setLocationPrefsMessage({ type: 'success', text: 'Saved.' });
            }
            setLocationPrefsLoading(false);
          }}
        />
      </div>

      {locationPrefsMessage.text && (
        <div className={`mt-4 p-3 rounded-xl text-sm ${locationPrefsMessage.type === 'error'
          ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
          : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
        }`}>
          {locationPrefsMessage.text}
        </div>
      )}
    </div>
  );
}

function LocationPrefToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border-hard bg-surface-container px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface border border-white/5">
            {icon}
          </span>
          <span>{title}</span>
        </div>
        <p className="mt-2 text-sm text-on-surface-variant">{description}</p>
      </div>
      <div className="flex shrink-0 justify-end">
        <Switch.Root
          checked={checked}
          onCheckedChange={(c) => { void onChange(c); }}
          disabled={disabled}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border-hard bg-surface-container outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Switch.Thumb
            className="absolute left-0.5 top-1/2 h-5 w-5 shrink-0 rounded-full bg-white shadow block transition-[transform] duration-200 ease-out"
            style={{ transform: checked ? 'translate(20px, -50%)' : 'translate(0, -50%)' }}
          />
        </Switch.Root>
      </div>
    </div>
  );
}
