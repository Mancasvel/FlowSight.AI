-- FlowSight AI - Supabase Schema (Cloud)
-- ONLY stores: Teams, API Keys, Subscriptions, and DAILY SUMMARIES
-- Individual reports stay LOCAL on the PM's machine

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TEAMS (Organizations/Companies)
-- ============================================
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- API KEYS (One per team, expires monthly)
-- ============================================
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    key VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(100) DEFAULT 'Default Key',
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_api_keys_team ON api_keys(team_id);

-- ============================================
-- SUBSCRIPTIONS (Payment tracking)
-- ============================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    plan VARCHAR(50) NOT NULL DEFAULT 'free', -- free, pro, enterprise
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, cancelled, past_due
    max_developers INTEGER DEFAULT 3,
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_team ON subscriptions(team_id);

-- ============================================
-- DAILY SUMMARIES (Synced from PM's local DB)
-- These are the ONLY activity data stored in cloud
-- ============================================
CREATE TABLE daily_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    developer_id VARCHAR(255), -- NULL for team-wide summary
    developer_name VARCHAR(255),
    summary_date DATE NOT NULL,
    summary_text TEXT NOT NULL,
    total_reports INTEGER DEFAULT 0,
    activity_breakdown JSONB, -- {"coding": 45, "browsing": 20, "meeting": 10, ...}
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, developer_id, summary_date)
);

CREATE INDEX idx_summaries_team_date ON daily_summaries(team_id, summary_date DESC);
CREATE INDEX idx_summaries_developer ON daily_summaries(developer_id);

-- ============================================
-- TEAM USAGE STATS (For billing/analytics)
-- ============================================
CREATE TABLE team_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the month
    total_developers INTEGER DEFAULT 0,
    total_summaries INTEGER DEFAULT 0,
    total_reports_processed INTEGER DEFAULT 0,
    storage_mb DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, month)
);

CREATE INDEX idx_usage_team_month ON team_usage(team_id, month DESC);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate API key
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN 'fsk_' || encode(gen_random_bytes(28), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to validate API key
CREATE OR REPLACE FUNCTION validate_api_key(p_key VARCHAR)
RETURNS TABLE(
    team_id UUID,
    team_name VARCHAR,
    is_valid BOOLEAN,
    expires_at TIMESTAMPTZ,
    plan VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as team_id,
        t.name as team_name,
        (ak.is_active AND ak.expires_at > NOW()) as is_valid,
        ak.expires_at,
        s.plan
    FROM api_keys ak
    JOIN teams t ON t.id = ak.team_id
    LEFT JOIN subscriptions s ON s.team_id = t.id
    WHERE ak.key = p_key;
    
    -- Update last used
    UPDATE api_keys SET last_used_at = NOW() WHERE key = p_key;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_usage ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access" ON teams FOR ALL USING (true);
CREATE POLICY "Service role full access" ON api_keys FOR ALL USING (true);
CREATE POLICY "Service role full access" ON subscriptions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON daily_summaries FOR ALL USING (true);
CREATE POLICY "Service role full access" ON team_usage FOR ALL USING (true);

-- ============================================
-- SAMPLE DATA (for testing)
-- ============================================

-- Create a test team
INSERT INTO teams (id, name, email) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Demo Team', 'demo@flowsight.ai');

-- Create API key for test team (expires in 30 days)
INSERT INTO api_keys (team_id, key, expires_at) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'fsk_demo_key_for_testing_purposes_only', NOW() + INTERVAL '30 days');

-- Create subscription for test team
INSERT INTO subscriptions (team_id, plan, status, max_developers, current_period_end) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'pro', 'active', 20, NOW() + INTERVAL '30 days');

-- ============================================
-- NOTES
-- ============================================
-- 
-- This schema is designed for MINIMAL cloud storage:
-- - Individual activity reports are stored LOCALLY on PM's machine
-- - Only DAILY SUMMARIES are synced to cloud (once per day)
-- - This reduces cloud storage costs significantly
-- - PM can still see real-time data locally
-- - Cloud backup only contains aggregated data
--
-- Data flow:
-- 1. DEV Agent -> PM Dashboard (local SQLite)
-- 2. PM Dashboard generates daily summaries (using local Ollama)
-- 3. Summaries are synced to Supabase (1x per day or manually)
-- 4. Raw reports are cleaned up locally after 7 days
--
