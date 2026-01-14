-- Add line_notifications_enabled column to ledger_members table
-- This column stores individual user's notification preference for each ledger

-- 1. Add the column if it doesn't exist
ALTER TABLE ledger_members 
ADD COLUMN IF NOT EXISTS line_notifications_enabled BOOLEAN DEFAULT FALSE;

-- 2. Add a comment to document the column
COMMENT ON COLUMN ledger_members.line_notifications_enabled IS 'Whether this member wants to receive LINE notifications for this ledger';

-- 3. Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_ledger_members_notifications 
ON ledger_members(ledger_id, line_notifications_enabled) 
WHERE line_notifications_enabled = true;

-- 4. Reset schema cache to ensure Supabase recognizes the new column
NOTIFY pgrst, 'reload schema';

