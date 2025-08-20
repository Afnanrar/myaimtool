-- Fix Database Schema for Facebook Messenger Tool
-- Run this in your Supabase SQL editor to fix missing columns

-- Check if pages table exists and has the right structure
DO $$ 
BEGIN
    -- Add created_at column to pages if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pages' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE pages ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to pages table';
    ELSE
        RAISE NOTICE 'created_at column already exists in pages table';
    END IF;

    -- Add updated_at column to pages if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pages' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE pages ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to pages table';
    ELSE
        RAISE NOTICE 'updated_at column already exists in pages table';
    END IF;

    -- Add created_at column to conversations if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE conversations ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to conversations table';
    ELSE
        RAISE NOTICE 'created_at column already exists in conversations table';
    END IF;

    -- Add updated_at column to conversations if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE conversations ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to conversations table';
    ELSE
        RAISE NOTICE 'updated_at column already exists in conversations table';
    END IF;

    -- Add created_at column to messages if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE messages ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to messages table';
    ELSE
        RAISE NOTICE 'created_at column already exists in messages table';
    END IF;

    -- Add created_at column to broadcasts if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'broadcasts' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE broadcasts ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to broadcasts table';
    ELSE
        RAISE NOTICE 'created_at column already exists in broadcasts table';
    END IF;

    -- Add completed_at column to broadcasts if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'broadcasts' AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE broadcasts ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added completed_at column to broadcasts table';
    ELSE
        RAISE NOTICE 'completed_at column already exists in broadcasts table';
    END IF;

    -- Add created_at column to users if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to users table';
    ELSE
        RAISE NOTICE 'created_at column already exists in users table';
    END IF;

    -- Add updated_at column to users if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to users table';
    ELSE
        RAISE NOTICE 'updated_at column already exists in users table';
    END IF;

END $$;

-- Show current table structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name IN ('users', 'pages', 'conversations', 'messages', 'broadcasts')
ORDER BY table_name, ordinal_position;
