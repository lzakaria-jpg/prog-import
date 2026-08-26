-- ─── User Activity Analytics ────────────────────────────────────────
-- Run this in Supabase SQL Editor (safe to re-run)

-- 1. Activity log table
CREATE TABLE IF NOT EXISTS user_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,       -- 'login', 'logout', 'journal_import', 'journal_export', 'journal_error', 'merge_import', 'merge_export', 'merge_error'
  details JSONB DEFAULT '{}', -- extra info: { filename, entries_count, error_msg, etc. }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_email ON user_activity(user_email);
CREATE INDEX IF NOT EXISTS idx_user_activity_action ON user_activity(action);
CREATE INDEX IF NOT EXISTS idx_user_activity_created ON user_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_email_created ON user_activity(user_email, created_at DESC);

-- 3. RLS - allow all for anon
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "activity_all_access" ON user_activity;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "activity_all_access" ON user_activity
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Enable Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_activity;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
