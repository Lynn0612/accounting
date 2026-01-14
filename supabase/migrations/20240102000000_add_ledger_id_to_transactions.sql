-- Add ledger_id to transactions table and enable RLS
-- This migration adds support for shared ledgers in the transactions table

-- 1. Add ledger_id column to transactions table (if not exists)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE;

-- 2. Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_id ON transactions(ledger_id);

-- 3. Enable RLS on transactions (if not already enabled)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view transactions in their ledgers" ON transactions;
DROP POLICY IF EXISTS "Users can create transactions in their ledgers" ON transactions;
DROP POLICY IF EXISTS "Users can update transactions in their ledgers" ON transactions;
DROP POLICY IF EXISTS "Users can delete transactions in their ledgers" ON transactions;
DROP POLICY IF EXISTS "Users can view transactions in their ledgers or books" ON transactions;
DROP POLICY IF EXISTS "Users can create transactions in their ledgers or books" ON transactions;
DROP POLICY IF EXISTS "Users can update transactions in their ledgers or books" ON transactions;
DROP POLICY IF EXISTS "Users can delete transactions in their ledgers or books" ON transactions;

-- 5. RLS Policies for transactions with ledger support
-- Users can view transactions if:
-- - They are members of the ledger (if ledger_id is set), OR
-- - They own the book (if book_id is set and they are the owner)
CREATE POLICY "Users can view transactions in their ledgers or books"
  ON transactions FOR SELECT
  USING (
    -- If ledger_id exists, check ledger membership
    (ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = transactions.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    OR
    -- If book_id exists, check book ownership (existing logic)
    (book_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM account_books
      WHERE account_books.id = transactions.book_id
      AND account_books.owner_id = auth.uid()
    ))
  );

-- Users can create transactions if they are members of the ledger or own the book
CREATE POLICY "Users can create transactions in their ledgers or books"
  ON transactions FOR INSERT
  WITH CHECK (
    -- If ledger_id is set, check ledger membership
    (ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = transactions.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    OR
    -- If book_id is set, check book ownership
    (book_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM account_books
      WHERE account_books.id = transactions.book_id
      AND account_books.owner_id = auth.uid()
    ))
  );

-- Users can update transactions in ledgers they are members of or books they own
CREATE POLICY "Users can update transactions in their ledgers or books"
  ON transactions FOR UPDATE
  USING (
    (ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = transactions.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    OR
    (book_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM account_books
      WHERE account_books.id = transactions.book_id
      AND account_books.owner_id = auth.uid()
    ))
  );

-- Users can delete transactions in ledgers they are members of or books they own
CREATE POLICY "Users can delete transactions in their ledgers or books"
  ON transactions FOR DELETE
  USING (
    (ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = transactions.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    OR
    (book_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM account_books
      WHERE account_books.id = transactions.book_id
      AND account_books.owner_id = auth.uid()
    ))
  );

