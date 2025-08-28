-- Facebook Messenger Rate Limiter Database Schema
-- Run this in your Supabase SQL editor

-- Global rate limiter configuration
CREATE TABLE rate_limiter_configs (
  id TEXT PRIMARY KEY DEFAULT 'global',
  baseline_rate_mps INTEGER NOT NULL DEFAULT 20,
  burst_ceiling_mps INTEGER NOT NULL DEFAULT 40,
  hard_guardrail_mps INTEGER NOT NULL DEFAULT 250,
  recipient_min_gap_sec INTEGER NOT NULL DEFAULT 2,
  backoff_max_sec INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Page-specific rate limiter configuration overrides
CREATE TABLE rate_limiter_page_configs (
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

-- Message queue for rate limiting
CREATE TABLE message_queue (
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

-- Rate limiter metrics and monitoring
CREATE TABLE rate_limiter_metrics (
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

-- Rate limiter events for observability
CREATE TABLE rate_limiter_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

-- Insert default global configuration
INSERT INTO rate_limiter_configs (id, baseline_rate_mps, burst_ceiling_mps, hard_guardrail_mps, recipient_min_gap_sec, backoff_max_sec) 
VALUES ('global', 20, 40, 250, 2, 60);

-- Create indexes for performance
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
ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limiter_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limiter_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies (adjust based on your auth setup)
-- For now, allowing all operations - you should restrict based on your user roles

-- Rate limiter configs - readable by all, writable by admins
CREATE POLICY "Rate limiter configs readable by all" ON rate_limiter_configs FOR SELECT USING (true);
CREATE POLICY "Rate limiter configs writable by admins" ON rate_limiter_configs FOR ALL USING (true);

-- Page configs - readable by page owners, writable by page owners
CREATE POLICY "Page configs readable by page owners" ON rate_limiter_page_configs FOR SELECT USING (true);
CREATE POLICY "Page configs writable by page owners" ON rate_limiter_page_configs FOR ALL USING (true);

-- Message queue - readable by page owners, writable by system
CREATE POLICY "Message queue readable by page owners" ON message_queue FOR SELECT USING (true);
CREATE POLICY "Message queue writable by system" ON message_queue FOR ALL USING (true);

-- Metrics - readable by page owners, writable by system
CREATE POLICY "Metrics readable by page owners" ON rate_limiter_metrics FOR SELECT USING (true);
CREATE POLICY "Metrics writable by system" ON rate_limiter_metrics FOR ALL USING (true);

-- Events - readable by page owners, writable by system
CREATE POLICY "Events readable by page owners" ON rate_limiter_events FOR SELECT USING (true);
CREATE POLICY "Events writable by system" ON rate_limiter_events FOR ALL USING (true);

-- Functions for queue management
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

-- Function to update message status
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

-- Function to clean old metrics (keep last 30 days)
CREATE OR REPLACE FUNCTION clean_old_rate_limiter_metrics()
RETURNS VOID AS $$
BEGIN
  DELETE FROM rate_limiter_metrics 
  WHERE timestamp < NOW() - INTERVAL '30 days';
  
  DELETE FROM rate_limiter_events 
  WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Create a cron job to clean old data (if you have pg_cron extension)
-- SELECT cron.schedule('clean-rate-limiter-metrics', '0 2 * * *', 'SELECT clean_old_rate_limiter_metrics();');

-- Comments for documentation
COMMENT ON TABLE rate_limiter_configs IS 'Global rate limiter configuration for Facebook Messenger sends';
COMMENT ON TABLE rate_limiter_page_configs IS 'Page-specific rate limiter configuration overrides';
COMMENT ON TABLE message_queue IS 'Message queue for rate-limited Facebook Messenger sends';
COMMENT ON TABLE rate_limiter_metrics IS 'Rate limiter performance metrics and monitoring data';
COMMENT ON TABLE rate_limiter_events IS 'Rate limiter events for observability and debugging';

COMMENT ON COLUMN rate_limiter_configs.baseline_rate_mps IS 'Baseline rate: 20 messages/second';
COMMENT ON COLUMN rate_limiter_configs.burst_ceiling_mps IS 'Burst ceiling: 40 messages/second for up to 60 seconds';
COMMENT ON COLUMN rate_limiter_configs.hard_guardrail_mps IS 'Absolute guardrail: 250 requests/second (hard stop)';
COMMENT ON COLUMN rate_limiter_configs.recipient_min_gap_sec IS 'Per-recipient pacing: minimum 2 seconds between messages';
COMMENT ON COLUMN rate_limiter_configs.backoff_max_sec IS 'Maximum backoff time: 60 seconds';
