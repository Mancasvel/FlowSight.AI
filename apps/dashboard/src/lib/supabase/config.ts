// FlowSight Cloud Configuration
// These credentials connect to FlowSight's Supabase instance
// All customer data is stored securely in our cloud

// Production credentials (replace with your actual Supabase project)
const FLOWSIGHT_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const FLOWSIGHT_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

// Service role key (server-side only, never exposed to browser)
const FLOWSIGHT_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Data retention policy
export const RETENTION_DAYS = 30; // Keep detailed reports for 30 days
export const MAX_REPORTS_PER_DAY = 1000; // Per developer limit

// Subscription plans
export const PLANS = {
  free: {
    name: 'Free',
    maxDevelopers: 3,
    retentionDays: 7,
    price: 0,
  },
  pro: {
    name: 'Pro',
    maxDevelopers: 20,
    retentionDays: 30,
    price: 29, // per month
  },
  enterprise: {
    name: 'Enterprise',
    maxDevelopers: -1, // unlimited
    retentionDays: 90,
    price: 99, // per month
  },
} as const;

export const config = {
  supabaseUrl: FLOWSIGHT_SUPABASE_URL,
  supabaseAnonKey: FLOWSIGHT_SUPABASE_ANON_KEY,
  supabaseServiceKey: FLOWSIGHT_SERVICE_KEY,
  retentionDays: RETENTION_DAYS,
  maxReportsPerDay: MAX_REPORTS_PER_DAY,
  plans: PLANS,
};

export default config;
