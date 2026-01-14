-- Add Viewer role support to ledger_members table
-- This migration updates the role CHECK constraint to include 'Viewer'

-- Drop the existing CHECK constraint if it exists
ALTER TABLE ledger_members 
DROP CONSTRAINT IF EXISTS ledger_members_role_check;

-- Add new CHECK constraint that includes 'Viewer'
ALTER TABLE ledger_members 
ADD CONSTRAINT ledger_members_role_check 
CHECK (role IN ('Owner', 'Member', 'Viewer'));

