-- ─── Chat System Schema ─────────────────────────────────────────────
-- Run this SQL in your Supabase SQL Editor (safe to run multiple times)

-- 1. Messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_email TEXT NOT NULL,
  recipient_email TEXT, -- NULL = public channel
  content TEXT,
  message_type TEXT DEFAULT 'text', -- text, file, image
  file_name TEXT,
  file_url TEXT,
  file_size BIGINT,
  is_edited BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes (safe to re-run)
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient ON chat_messages(recipient_email);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_email);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(recipient_email, created_at DESC);

-- 3. RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "chat_all_access" ON chat_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "chat_all_access" ON chat_messages
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Enable Realtime (idempotent)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION update_chat_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_updated_at ON chat_messages;
CREATE TRIGGER chat_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_timestamp();

-- 6. Storage bucket for chat files
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage RLS
DO $$ BEGIN
  DROP POLICY IF EXISTS "chat_files_all" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "chat_files_all" ON storage.objects
  FOR ALL USING (bucket_id = 'chat-files') WITH CHECK (bucket_id = 'chat-files');
