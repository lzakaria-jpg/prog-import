-- ─── RBAC / PBAC + Chat v2 Schema ───────────────────────────────────────
-- Run this SQL in your Supabase SQL Editor. Safe to run multiple times
-- (every statement is idempotent). Purely additive: does not touch or drop
-- allowed_users, app_settings, or existing chat_messages rows.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. USERS — roles + per-permission grants
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'full_user_manager', 'user')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Exactly one owner ever: a second INSERT/UPDATE trying to set role='owner'
-- while one already exists fails at the database level, not just in the app.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_single_owner ON users(role) WHERE role = 'owner';

CREATE OR REPLACE FUNCTION users_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_touch_updated_at();

-- Real backend protection for the owner row, independent of who is asking
-- (this app has no per-request server session, so this is enforced as an
-- unconditional database invariant instead): the owner row can never be
-- deleted, can never lose the 'owner' role, and can never be deactivated.
-- Changing the owner's own email is allowed at this layer (the app only
-- exposes that action to the owner's own session).
CREATE OR REPLACE FUNCTION protect_owner_row() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      RAISE EXCEPTION 'OWNER_PROTECTED: the owner account can never be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' THEN
    IF NEW.role <> 'owner' THEN
      RAISE EXCEPTION 'OWNER_PROTECTED: the owner role can never be changed';
    END IF;
    IF NEW.active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'OWNER_PROTECTED: the owner account can never be disabled';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_owner ON users;
CREATE TRIGGER trg_protect_owner BEFORE UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_owner_row();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "users_all_access" ON users;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- NOTE: this app authenticates with a custom whitelist model (no Supabase Auth
-- session), so Postgres cannot tell which app-user is making a request — the
-- anon key is shared by everyone. Per-row RLS keyed on "is this the owner"
-- is therefore not enforceable at this layer; the owner-immutability trigger
-- above is the real backend guarantee, and the app additionally gates every
-- management action client-side. See auth.jsx comments for the full picture.
CREATE POLICY "users_all_access" ON users FOR ALL USING (true) WITH CHECK (true);

-- Seed `users` from the existing allowed_users whitelist + admin_email, once,
-- without disturbing anything if it has already been run.
--
-- Existing (pre-RBAC) users are grandfathered in with every tool + basic chat
-- permission — exactly what unrestricted allowed_users access already gave
-- them — so flipping this schema on cannot silently lock anyone out of a
-- tool they used yesterday. The owner/full user managers can then dial any
-- of them down from the new per-user checkbox screen. Brand-new users
-- created after this point start from the app's restrictive default
-- (chat-only) instead — see DEFAULT_NEW_USER_PERMISSIONS in permissions.js.
INSERT INTO users (email, role, permissions, active)
SELECT
  au.email,
  CASE WHEN au.email = (SELECT value FROM app_settings WHERE key = 'admin_email') THEN 'owner' ELSE 'user' END,
  CASE WHEN au.email = (SELECT value FROM app_settings WHERE key = 'admin_email')
    THEN '{}'::jsonb
    ELSE '{"tool.journal": true, "tool.merge": true, "tool.bills": true, "tool.sales": true, "tool.chat": true, "tool.ai": true, "chat.view_public": true, "chat.send": true, "chat.delete_own": true, "chat.edit_own": true}'::jsonb
  END,
  TRUE
FROM allowed_users au
ON CONFLICT (email) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. AUDIT LOG — administrative actions, owner-only visibility (app-side)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_email TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_email);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
  DROP POLICY IF EXISTS "audit_log_select" ON audit_log;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT USING (true);
-- Deliberately no UPDATE or DELETE policy: RLS default-denies both, so audit
-- records are immutable and cannot be altered or removed by anyone, ever,
-- through the public API — the only real way to guarantee "normal users
-- cannot delete or modify audit records" without a per-request identity.

-- ═══════════════════════════════════════════════════════════════════════
-- 3. CHAT GROUPS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chat_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_group_members (
  group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  added_by TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, email)
);

CREATE INDEX IF NOT EXISTS idx_chat_group_members_email ON chat_group_members(email);

ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "chat_groups_all" ON chat_groups;
  DROP POLICY IF EXISTS "chat_group_members_all" ON chat_group_members;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "chat_groups_all" ON chat_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "chat_group_members_all" ON chat_group_members FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_groups;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_group_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. CHAT MESSAGES — additive columns for groups, pinning, mentions
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned_by TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS mentions TEXT[];

CREATE INDEX IF NOT EXISTS idx_chat_messages_group ON chat_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON chat_messages(pinned) WHERE pinned = TRUE;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. NOTIFICATIONS — in-app, real-time
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'mention',
  actor_email TEXT,
  message_id UUID,
  channel_label TEXT,
  content_preview TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_email, is_read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "notifications_all" ON notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "notifications_all" ON notifications FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. EMAIL NOTIFICATION LOG — dedup window for repeated @mentions
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS email_notifications_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  actor_email TEXT,
  message_id UUID,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_notif_dedup ON email_notifications_log(recipient_email, actor_email, sent_at DESC);

ALTER TABLE email_notifications_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "email_notifications_log_all" ON email_notifications_log;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "email_notifications_log_all" ON email_notifications_log FOR ALL USING (true) WITH CHECK (true);
