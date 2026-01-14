-- Add is_active column to account_books table
-- This column indicates whether an account book is currently active

-- 1. Add the column if it doesn't exist
ALTER TABLE account_books 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;

-- 2. Add a comment to document the column
COMMENT ON COLUMN account_books.is_active IS 'Whether this account book is currently active';

-- 3. Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_account_books_is_active 
ON account_books(owner_id, is_active) 
WHERE is_active = true;

-- 4. Reset schema cache to ensure Supabase recognizes the new column
NOTIFY pgrst, 'reload schema';

