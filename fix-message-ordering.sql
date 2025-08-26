-- Fix Message Ordering: Add event_time column and proper indexes
-- This script ensures messages are ordered correctly by Facebook event timestamps

-- 1. Add event_time column to messages table (Facebook event timestamp)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS event_time TIMESTAMP WITH TIME ZONE;

-- 2. Update existing messages to use created_at as event_time if event_time is null
UPDATE messages 
SET event_time = created_at 
WHERE event_time IS NULL;

-- 3. Make event_time NOT NULL after populating
ALTER TABLE messages 
ALTER COLUMN event_time SET NOT NULL;

-- 4. Add unique constraint on Facebook message ID to prevent duplicates
ALTER TABLE messages 
ADD CONSTRAINT IF NOT EXISTS messages_facebook_message_id_unique 
UNIQUE (facebook_message_id);

-- 5. Add indexes for stable sorting and performance
-- Index for message ordering within conversations
CREATE INDEX IF NOT EXISTS idx_messages_conversation_event_time 
ON messages (conversation_id, event_time);

-- Index for conversation list ordering
CREATE INDEX IF NOT EXISTS idx_conversations_page_last_message_time 
ON conversations (page_id, last_message_time DESC);

-- Index for message pagination and infinite scroll
CREATE INDEX IF NOT EXISTS idx_messages_page_id_event_time 
ON messages (page_id, event_time);

-- Index for infinite scroll: (page_id, participant_id, event_time DESC)
CREATE INDEX IF NOT EXISTS idx_messages_page_participant_event_time 
ON messages (page_id, participant_id, event_time DESC);

-- 6. Update conversations table to ensure last_message_time is properly typed
ALTER TABLE conversations 
ALTER COLUMN last_message_time TYPE TIMESTAMP WITH TIME ZONE 
USING last_message_time::TIMESTAMP WITH TIME ZONE;

-- 7. Add index for conversation ordering by participant and time
CREATE INDEX IF NOT EXISTS idx_conversations_participant_time 
ON conversations (participant_id, last_message_time DESC);

-- 8. Verify the changes
SELECT 
  'messages' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'messages' AND column_name IN ('created_at', 'event_time', 'facebook_message_id')
ORDER BY column_name;

SELECT 
  'conversations' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'conversations' AND column_name IN ('last_message_time')
ORDER BY column_name;

-- 9. Show sample message ordering
SELECT 
  id,
  conversation_id,
  facebook_message_id,
  message_text,
  created_at,
  event_time,
  is_from_page
FROM messages 
ORDER BY conversation_id, event_time 
LIMIT 10;

-- 10. Show conversation ordering
SELECT 
  id,
  participant_name,
  last_message_time,
  unread_count
FROM conversations 
ORDER BY last_message_time DESC 
LIMIT 10;
