/** Matches Supabase `Json` for JSON/JSONB columns (e.g. context_tags). */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
