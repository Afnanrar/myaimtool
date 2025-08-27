-- Add echo message support to MyAim My Dream Tool
-- This script adds the is_echo field to track outgoing message confirmations

-- Add is_echo column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_echo BOOLEAN DEFAULT FALSE;

-- Add index for echo message lookups
CREATE INDEX IF NOT EXISTS idx_messages_is_echo ON messages(is_echo);

-- Add index for echo message reconciliation
CREATE INDEX IF NOT EXISTS idx_messages_facebook_id_echo ON messages(facebook_message_id, is_echo);

-- Update existing messages to mark page-sent messages as potential echoes
UPDATE messages 
SET is_echo = TRUE 
WHERE is_from_page = TRUE AND facebook_message_id IS NOT NULL;

-- Add comment to explain the new field
COMMENT ON COLUMN messages.is_echo IS 'Indicates if this message is an echo webhook confirmation of an outgoing message';

-- Verify the changes
SELECT 
  COUNT(*) as total_messages,
  COUNT(*) FILTER (WHERE is_echo = TRUE) as echo_messages,
  COUNT(*) FILTER (WHERE is_from_page = TRUE) as page_messages
FROM messages;
