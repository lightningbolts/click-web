import type { Json } from './supabase-json';

/**
 * Supabase-style row/insert/update shapes for Phase 1 Insights tables.
 * Merge into generated `Database` when you run `supabase gen types`.
 */

export type SubscriptionStatus =
  | 'inactive'
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid';

export type VenueManagerRole = 'owner' | 'manager' | 'viewer';

export type MetricsBucketGranularity = 'hour' | 'day';

export interface VenueRow {
  id: string;
  name: string;
  location: string | null;
  floorplan_svg_url: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  created_at: string;
}

export interface VenueInsert {
  id?: string;
  name: string;
  location?: string | null;
  floorplan_svg_url?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: SubscriptionStatus;
  created_at?: string;
}

export interface VenueUpdate {
  name?: string;
  location?: string | null;
  floorplan_svg_url?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: SubscriptionStatus;
  created_at?: string;
}

export interface VenueManagerRow {
  id: string;
  user_id: string;
  venue_id: string;
  role: VenueManagerRole;
  created_at: string;
}

export interface VenueManagerInsert {
  id?: string;
  user_id: string;
  venue_id: string;
  role?: VenueManagerRole;
  created_at?: string;
}

export interface VenueManagerUpdate {
  role?: VenueManagerRole;
}

export interface NfcAnchorRow {
  id: string;
  venue_id: string;
  name: string;
  map_x: number;
  map_y: number;
  qr_token: string;
  created_at: string;
}

export interface NfcAnchorInsert {
  id?: string;
  venue_id: string;
  name: string;
  map_x: number;
  map_y: number;
  qr_token?: string;
  created_at?: string;
}

export interface NfcAnchorUpdate {
  name?: string;
  map_x?: number;
  map_y?: number;
}

/** Backing materialized view (prefer `venue_metrics` view from client with RLS). */
export interface VenueMetricsMaterializedRow {
  venue_id: string;
  period_start: string;
  bucket_granularity: MetricsBucketGranularity;
  connection_count: number;
  context_tags: Json;
  vibe_rating_avg: number | null;
  vibe_rating_samples: number;
}

/** Optional: merge into generated `Database['public']['Tables']` after `supabase gen types`. */
export type InsightsPublicTables = {
  venues: {
    Row: VenueRow;
    Insert: VenueInsert;
    Update: VenueUpdate;
    Relationships: [];
  };
  venue_managers: {
    Row: VenueManagerRow;
    Insert: VenueManagerInsert;
    Update: VenueManagerUpdate;
    Relationships: [];
  };
  nfc_anchors: {
    Row: NfcAnchorRow;
    Insert: NfcAnchorInsert;
    Update: NfcAnchorUpdate;
    Relationships: [];
  };
};
