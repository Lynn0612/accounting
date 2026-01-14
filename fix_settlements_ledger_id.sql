-- Fix settlements table: rename book_id to ledger_id
-- This aligns with the ledger system and fixes 400 errors

-- 1. Rename column from book_id to ledger_id
ALTER TABLE public.settlements 
RENAME COLUMN book_id TO ledger_id;

-- 2. Update foreign key constraint if it exists
-- Drop old constraint if it references account_books
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'settlements_book_id_fkey' 
    AND conrelid = 'settlements'::regclass
  ) THEN
    ALTER TABLE public.settlements 
    DROP CONSTRAINT settlements_book_id_fkey;
  END IF;
  
  -- Also drop ledger_id constraint if it exists (we'll rely on RLS instead)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'settlements_ledger_id_fkey' 
    AND conrelid = 'settlements'::regclass
  ) THEN
    ALTER TABLE public.settlements 
    DROP CONSTRAINT settlements_ledger_id_fkey;
  END IF;
END $$;

-- Note: We don't add a foreign key constraint because ledger_id can reference either:
-- - ledgers.id (for ledger type)
-- - account_books.id (for account_book type, but stored in ledger_id column)
-- RLS policies will handle access control instead

-- 3. Update RLS policies
DROP POLICY IF EXISTS "Allow authenticated access" ON settlements;
DROP POLICY IF EXISTS "Users can view settlements in their ledgers" ON settlements;
DROP POLICY IF EXISTS "Users can manage settlements in their ledgers" ON settlements;

-- Create new SELECT policy
-- Note: After renaming book_id to ledger_id, settlements.ledger_id can reference either:
-- - ledgers.id (for ledger type)
-- - account_books.id (for account_book type, but stored in ledger_id column)
CREATE POLICY "Users can view settlements in their ledgers"
ON settlements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM ledger_members
    WHERE ledger_members.ledger_id = settlements.ledger_id
      AND ledger_members.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM book_members
    WHERE book_members.book_id = settlements.ledger_id
      AND book_members.user_id = auth.uid()
  )
);

-- Create INSERT policy
CREATE POLICY "Users can insert settlements in their ledgers"
ON settlements
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM ledger_members
    WHERE ledger_members.ledger_id = settlements.ledger_id
      AND ledger_members.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM book_members
    WHERE book_members.book_id = settlements.ledger_id
      AND book_members.user_id = auth.uid()
  )
);

-- Create UPDATE policy
CREATE POLICY "Users can update settlements in their ledgers"
ON settlements
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM ledger_members
    WHERE ledger_members.ledger_id = settlements.ledger_id
      AND ledger_members.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM book_members
    WHERE book_members.book_id = settlements.ledger_id
      AND book_members.user_id = auth.uid()
  )
);

-- Create DELETE policy
CREATE POLICY "Users can delete settlements in their ledgers"
ON settlements
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM ledger_members
    WHERE ledger_members.ledger_id = settlements.ledger_id
      AND ledger_members.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM book_members
    WHERE book_members.book_id = settlements.ledger_id
      AND book_members.user_id = auth.uid()
  )
);

-- 4. Update index if it exists
DROP INDEX IF EXISTS idx_settlements_book_id;
DROP INDEX IF EXISTS idx_settlements_ledger_date;

-- Create new index
CREATE INDEX IF NOT EXISTS idx_settlements_ledger_id 
ON settlements(ledger_id);

CREATE INDEX IF NOT EXISTS idx_settlements_ledger_date 
ON settlements(ledger_id, date DESC);

-- 5. Reset schema cache
NOTIFY pgrst, 'reload schema';

