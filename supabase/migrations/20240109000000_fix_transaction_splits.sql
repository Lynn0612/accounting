-- Fix transaction_splits table structure
-- Add ledger_id column and make book_id nullable
-- Remove is_payer if it doesn't exist, or add it if needed

-- 1. Add ledger_id column if it doesn't exist
ALTER TABLE transaction_splits 
ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE;

-- 2. Make book_id nullable (if it has NOT NULL constraint)
ALTER TABLE transaction_splits 
ALTER COLUMN book_id DROP NOT NULL;

-- 3. Check if is_payer column exists, if not, we'll remove it from code
-- Note: If is_payer doesn't exist in the table, we need to remove it from the insert

