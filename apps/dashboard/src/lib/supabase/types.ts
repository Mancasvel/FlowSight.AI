// FlowSight AI - Supabase Database Types

export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due';
export type ActivityType = 'coding' | 'browsing' | 'meeting' | 'terminal' | 'documentation' | 'idle' | 'other';

export interface Team {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  team_id: string;
  key: string;
  name: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface Subscription {
  id: string;
  team_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Developer {
  id: string;
  team_id: string;
  name: string;
  email: string | null;
  device_id: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityReport {
  id: string;
  developer_id: string;
  team_id: string;
  description: string;
  activity_type: ActivityType;
  app_name: string | null;
  window_title: string | null;
  created_at: string;
}

export interface DailySummary {
  id: string;
  team_id: string;
  developer_id: string | null;
  summary_date: string;
  summary_text: string;
  total_reports: number;
  activity_breakdown: Record<ActivityType, number> | null;
  created_at: string;
}

// API Response types
export interface ValidateApiKeyResult {
  team_id: string;
  team_name: string;
  is_valid: boolean;
  expires_at: string;
}

export interface RegisterDeveloperResult {
  developer_id: string;
  team_id: string;
  success: boolean;
  message: string;
}

// Supabase Database type
export interface Database {
  public: {
    Tables: {
      teams: {
        Row: Team;
        Insert: Omit<Team, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Team, 'id'>>;
      };
      api_keys: {
        Row: ApiKey;
        Insert: Omit<ApiKey, 'id' | 'created_at' | 'last_used_at'>;
        Update: Partial<Omit<ApiKey, 'id'>>;
      };
      subscriptions: {
        Row: Subscription;
        Insert: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Subscription, 'id'>>;
      };
      developers: {
        Row: Developer;
        Insert: Omit<Developer, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Developer, 'id'>>;
      };
      activity_reports: {
        Row: ActivityReport;
        Insert: Omit<ActivityReport, 'id' | 'created_at'>;
        Update: Partial<Omit<ActivityReport, 'id'>>;
      };
      daily_summaries: {
        Row: DailySummary;
        Insert: Omit<DailySummary, 'id' | 'created_at'>;
        Update: Partial<Omit<DailySummary, 'id'>>;
      };
    };
    Functions: {
      validate_api_key: {
        Args: { p_key: string };
        Returns: ValidateApiKeyResult[];
      };
      register_developer: {
        Args: {
          p_api_key: string;
          p_name: string;
          p_device_id: string;
          p_email?: string;
        };
        Returns: RegisterDeveloperResult[];
      };
      generate_api_key: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
  };
}
