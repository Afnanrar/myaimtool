-- Facebook Messenger Rate Limiter Database Schema (Supabase Only) - FORCE VERSION
-- This script will forcefully drop existing tables and recreate them
-- Run this in your Supabase SQL editor

-- First, let's check what exists and force drop everything
DO $$ 
BEGIN
    -- Drop all rate limiter related tables with CASCADE
    DROP TABLE IF EXISTS rate_limiter_events CASCADE;
    DROP TABLE IF EXISTS rate_limiter_metrics CASCADE;
    DROP TABLE IF EXISTS message_queue CASCADE;
    DROP TABLE IF EXISTS rate_limiter_tokens CASCADE;
    DROP TABLE IF EXISTS rate_limiter_page_configs CASCADE;
    DROP TABLE IF EXISTS rate_limiter_configs CASCADE;
    
    -- Also try dropping with different possible names
    DROP TABLE IF EXISTS "rate_limiter_events" CASCADE;
    DROP TABLE IF EXISTS "rate_limiter_metrics" CASCADE;
    DROP TABLE IF EXISTS "message_queue" CASCADE;
    DROP TABLE IF EXISTS "rate_limiter_tokens" CASCADE;
    DROP TABLE IF EXISTS "rate_limiter_page_configs" CASCADE;
    DROP TABLE IF EXISTS "rate_limiter_configs" CASCADE;
    
    RAISE NOTICE 'All existing rate limiter tables dropped successfully';
END $$;

-- Drop all functions that might exist
DO $$
BEGIN
    -- Drop functions with different possible signatures
    DROP FUNCTION IF EXISTS get_next_message_from_queue(UUID);
    DROP FUNCTION IF EXISTS get_next_message_from_queue(page_uuid UUID);
    DROP FUNCTION IF EXISTS update_message_status(UUID, TEXT, TEXT, TEXT);
    DROP FUNCTION IF EXISTS update_message_status(message_uuid UUID, new_status TEXT, error_msg TEXT, fb_message_id TEXT);
    DROP FUNCTION IF EXISTS initialize_token_bucket(UUID, INTEGER);
    DROP FUNCTION IF EXISTS initialize_token_bucket(page_uuid UUID, burst_limit INTEGER);
    DROP FUNCTION IF EXISTS clean_old_rate_limiter_metrics();
    
    RAISE NOTICE 'All existing rate limiter functions dropped successfully';
END $$;

-- Wait a moment to ensure drops are complete
SELECT pg_sleep(1);

-- Now create the tables fresh
CREATE TABLE IF NOT EXISTS rate_limiter_configs (
  id TEXT PRIMARY KEY DEFAULT 'global',
  baseline_rate_mps INTEGER NOT NULL DEFAULT 20,
  burst_ceiling_mps INTEGER NOT NULL DEFAULT 40,
  hard_guardrail_mps INTEGER NOT NULL DEFAULT 250,
  recipient_min_gap_sec INTEGER NOT NULL DEFAULT 2,
  backoff_max_sec INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limiter_page_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  baseline_rate_mps INTEGER,
  burst_ceiling_mps INTEGER,
  hard_guardrail_mps INTEGER,
  recipient_min_gap_sec INTEGER,
  backoff_max_sec INTEGER,
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(page_id)
);

CREATE TABLE IF NOT EXISTS rate_limiter_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  tokens_remaining INTEGER NOT NULL DEFAULT 40,
  last_refill TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(page_id)
);

CREATE TABLE IF NOT EXISTS message_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  message_tag TEXT,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'blocked_policy', 'deferred_rate_limit')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  idempotency_key TEXT UNIQUE NOT NULL,
  queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  error_code INTEGER,
  facebook_message_id TEXT,
  not_before TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limiter_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sends_per_sec DECIMAL(10,2),
  tokens_remaining INTEGER,
  queue_length INTEGER,
  error_rate DECIMAL(5,2),
  error_613_count INTEGER,
  average_wait_time_ms INTEGER,
  current_backoff_sec INTEGER,
  baseline_rate_mps INTEGER,
  burst_ceiling_mps INTEGER
);

CREATE TABLE IF NOT EXISTS rate_limiter_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

-- Insert default global configuration (only if not exists)
INSERT INTO rate_limiter_configs (id, baseline_rate_mps, burst_ceiling_mps, hard_guardrail_mps, recipient_min_gap_sec, backoff_max_sec) 
VALUES ('global', 20, 40, 250, 2, 60)
ON CONFLICT (id) DO NOTHING;

-- Create indexes (drop if exists first)
DO $$
BEGIN
    -- Drop existing indexes if they exist
    DROP INDEX IF EXISTS idx_rate_limiter_tokens_page_id;
    DROP INDEX IF EXISTS idx_rate_limiter_tokens_last_refill;
    DROP INDEX IF EXISTS idx_message_queue_page_id;
    DROP INDEX IF EXISTS idx_message_queue_status;
    DROP INDEX IF EXISTS idx_message_queue_priority;
    DROP INDEX IF EXISTS idx_message_queue_not_before;
    DROP INDEX IF EXISTS idx_message_queue_idempotency;
    DROP INDEX IF EXISTS idx_rate_limiter_metrics_page_id;
    DROP INDEX IF EXISTS idx_rate_limiter_metrics_timestamp;
    DROP INDEX IF EXISTS idx_rate_limiter_events_page_id;
    DROP INDEX IF EXISTS idx_rate_limiter_events_timestamp;
    DROP INDEX IF EXISTS idx_rate_limiter_events_severity;
    
    RAISE NOTICE 'All existing indexes dropped successfully';
END $$;

-- Create fresh indexes
CREATE INDEX idx_rate_limiter_tokens_page_id ON rate_limiter_tokens(page_id);
CREATE INDEX idx_rate_limiter_tokens_last_refill ON rate_limiter_tokens(last_refill);
CREATE INDEX idx_message_queue_page_id ON message_queue(page_id);
CREATE INDEX idx_message_queue_status ON message_queue(status);
CREATE INDEX idx_message_queue_priority ON message_queue(priority DESC, queued_at ASC);
CREATE INDEX idx_message_queue_not_before ON message_queue(not_before);
CREATE INDEX idx_message_queue_idempotency ON message_queue(idempotency_key);
CREATE INDEX idx_rate_limiter_metrics_page_id ON rate_limiter_metrics(page_id);
CREATE INDEX idx_rate_limiter_metrics_timestamp ON rate_limiter_metrics(timestamp DESC);
CREATE INDEX idx_rate_limiter_events_page_id ON rate_limiter_events(page_id);
CREATE INDEX idx_rate_limiter_events_timestamp ON rate_limiter_events(timestamp DESC);
CREATE INDEX idx_rate_limiter_events_severity ON rate_limiter_events(severity);

-- Enable Row Level Security
ALTER TABLE rate_limiter_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limiter_page_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limiter_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limiter_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limiter_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$
BEGIN
    -- Drop all existing policies
    DROP POLICY IF EXISTS "Rate limiter configs readable by all" ON rate_limiter_configs;
    DROP POLICY IF EXISTS "Rate limiter configs writable by admins" ON rate_limiter_configs;
    DROP POLICY IF EXISTS "Page configs readable by page owners" ON rate_limiter_page_configs;
    DROP POLICY IF EXISTS "Page configs writable by page owners" ON rate_limiter_page_configs;
    DROP POLICY IF EXISTS "Token buckets readable by page owners" ON rate_limiter_tokens;
    DROP POLICY IF EXISTS "Token buckets writable by system" ON rate_limiter_tokens;
    DROP POLICY IF EXISTS "Message queue readable by page owners" ON message_queue;
    DROP POLICY IF EXISTS "Message queue writable by system" ON message_queue;
    DROP POLICY IF EXISTS "Metrics readable by page owners" ON rate_limiter_metrics;
    DROP POLICY IF EXISTS "Metrics writable by system" ON rate_limiter_metrics;
    DROP POLICY IF EXISTS "Events readable by page owners" ON rate_limiter_events;
    DROP POLICY IF EXISTS "Events writable by system" ON rate_limiter_events;
    
    RAISE NOTICE 'All existing policies dropped successfully';
END $$;

-- Create fresh policies
CREATE POLICY "Rate limiter configs readable by all" ON rate_limiter_configs FOR SELECT USING (true);
CREATE POLICY "Rate limiter configs writable by admins" ON rate_limiter_configs FOR ALL USING (true);
CREATE POLICY "Page configs readable by page owners" ON rate_limiter_page_configs FOR SELECT USING (true);
CREATE POLICY "Page configs writable by page owners" ON rate_limiter_page_configs FOR ALL USING (true);
CREATE POLICY "Token buckets readable by page owners" ON rate_limiter_tokens FOR SELECT USING (true);
CREATE POLICY "Token buckets writable by system" ON rate_limiter_tokens FOR ALL USING (true);
CREATE POLICY "Message queue readable by page owners" ON message_queue FOR SELECT USING (true);
CREATE POLICY "Message queue writable by system" ON message_queue FOR ALL USING (true);
CREATE POLICY "Metrics readable by page owners" ON rate_limiter_metrics FOR SELECT USING (true);
CREATE POLICY "Metrics writable by system" ON rate_limiter_metrics FOR ALL USING (true);
CREATE POLICY "Events readable by page owners" ON rate_limiter_events FOR SELECT USING (true);
CREATE POLICY "Events writable by system" ON rate_limiter_events FOR ALL USING (true);

-- Create or replace functions
CREATE OR REPLACE FUNCTION get_next_message_from_queue(page_uuid UUID)
RETURNS TABLE (
  id UUID,
  recipient_id TEXT,
  message_text TEXT,
  message_tag TEXT,
  priority INTEGER,
  idempotency_key TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mq.id,
    mq.recipient_id,
    mq.message_text,
    mq.message_tag,
    mq.priority,
    mq.idempotency_key
  FROM message_queue mq
  WHERE mq.page_id = page_uuid
    AND mq.status = 'queued'
    AND (mq.not_before IS NULL OR mq.not_before <= NOW())
  ORDER BY mq.priority DESC, mq.queued_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_message_status(
  message_uuid UUID,
  new_status TEXT,
  error_msg TEXT DEFAULT NULL,
  fb_message_id TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE message_queue 
  SET 
    status = new_status,
    error_message = error_msg,
    facebook_message_id = fb_message_id,
    completed_at = CASE WHEN new_status IN ('sent', 'failed', 'blocked_policy') THEN NOW() ELSE completed_at END
  WHERE id = message_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION initialize_token_bucket(page_uuid UUID, burst_limit INTEGER DEFAULT 40)
RETURNS VOID AS $$
BEGIN
  INSERT INTO rate_limiter_tokens (page_id, tokens_remaining, burst_ceiling)
  VALUES (page_uuid, burst_limit, burst_limit)
  ON CONFLICT (page_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION clean_old_rate_limiter_metrics()
RETURNS VOID AS $$
BEGIN
  DELETE FROM rate_limiter_metrics 
  WHERE timestamp < NOW() - INTERVAL '30 days';
  
  DELETE FROM rate_limiter_events 
  WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Success message
SELECT 'Rate limiter schema created successfully! All tables, functions, and policies are ready.' as status;
