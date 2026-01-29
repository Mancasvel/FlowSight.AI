import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import type { Database } from './types';

// Client for browser (uses anon key with RLS)
export function createBrowserClient() {
  return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

// Client for server (uses service role key, bypasses RLS)
export function createServerClient() {
  if (!config.supabaseServiceKey) {
    throw new Error('Supabase service key not configured');
  }
  return createClient<Database>(config.supabaseUrl, config.supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Singleton for browser
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (typeof window === 'undefined') {
    return createServerClient();
  }
  
  if (!browserClient) {
    browserClient = createBrowserClient();
  }
  return browserClient;
}

// Check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  return Boolean(
    config.supabaseUrl && 
    config.supabaseUrl !== 'https://your-project.supabase.co' &&
    config.supabaseAnonKey &&
    config.supabaseAnonKey !== 'your-anon-key'
  );
}
