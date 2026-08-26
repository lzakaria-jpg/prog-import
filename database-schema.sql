-- Qoyod Import Tool - Database Schema for Supabase
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- 1. Create allowed_users table
CREATE TABLE IF NOT EXISTS allowed_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create app_settings table (for storing admin email and other config)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS) but allow all operations for now
-- In production, you'd add proper auth policies
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Allow all operations (since we're using anon key)
-- In production, use proper auth policies
CREATE POLICY "Allow all operations on allowed_users" ON allowed_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on app_settings" ON app_settings FOR ALL USING (true) WITH CHECK (true);

-- 4. Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_allowed_users_email ON allowed_users(email);
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
