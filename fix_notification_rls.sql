-- Fix RLS policies for notification settings
-- Allow users to update their own notification settings in ledger_members and book_members

-- 1. For ledger_members table
-- Drop existing UPDATE policy if exists
DROP POLICY IF EXISTS "Users can update their own member settings" ON ledger_members;
DROP POLICY IF EXISTS "Users can update own notification settings" ON ledger_members;

-- Create policy to allow users to update their own notification settings
CREATE POLICY "Users can update own notification settings"
ON ledger_members
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. For book_members table
-- Drop existing UPDATE policy if exists
DROP POLICY IF EXISTS "Users can update their own member settings" ON book_members;
DROP POLICY IF EXISTS "Users can update own notification settings" ON book_members;

-- Create policy to allow users to update their own notification settings
CREATE POLICY "Users can update own notification settings"
ON book_members
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Note: These policies allow users to update ONLY their own row in the members tables
-- They can update any column, but in practice we only update is_notify_enabled/line_notifications_enabled

