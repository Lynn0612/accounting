-- RBAC: Restrict INSERT, UPDATE, DELETE on transactions table to Owner and Member roles only
-- This prevents Viewer role from creating, editing, or deleting transactions at the database level

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can insert transactions in their ledgers" ON transactions;
DROP POLICY IF EXISTS "Users can insert transactions in their books" ON transactions;
DROP POLICY IF EXISTS "Users can create transactions in their ledgers" ON transactions;
DROP POLICY IF EXISTS "Owners and Members can create transactions" ON transactions;
DROP POLICY IF EXISTS "Owners and Members can create transactions in ledgers" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated access" ON transactions;

-- For ledgers: Only allow INSERT if user is Owner or Member (not Viewer)
DROP POLICY IF EXISTS "Users can create transactions in their ledgers" ON transactions;
DROP POLICY IF EXISTS "Owners and Members can create transactions in ledgers" ON transactions;

CREATE POLICY "Owners and Members can create transactions in ledgers"
  ON transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Check if user is a member of the ledger with Owner or Member role (exclude Viewer)
    EXISTS (
      SELECT 1
      FROM ledger_members lm
      WHERE lm.ledger_id = transactions.ledger_id
        AND lm.user_id = auth.uid()
        AND lm.role IN ('Owner', 'Member')
    )
  );

-- For account_books: Only allow INSERT if user is Owner or Member (not Viewer)
DROP POLICY IF EXISTS "Owners and Members can create transactions in account_books" ON transactions;

CREATE POLICY "Owners and Members can create transactions in account_books"
  ON transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Check if user is the owner of the account_book
    EXISTS (
      SELECT 1
      FROM account_books ab
      WHERE ab.id = transactions.book_id
        AND ab.owner_id = auth.uid()
    )
    OR
    -- Or check if user is a member with Owner or Member role (exclude Viewer)
    -- Use correct column names: book_id, user_id, role
    EXISTS (
      SELECT 1
      FROM book_members bm
      WHERE bm.book_id = transactions.book_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('Owner', 'Member')
    )
  );

-- For ledgers: Only allow UPDATE if user is Owner or Member (not Viewer)
CREATE POLICY "Owners and Members can update transactions in ledgers"
  ON transactions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ledger_members lm
      WHERE lm.ledger_id = transactions.ledger_id
        AND lm.user_id = auth.uid()
        AND lm.role IN ('Owner', 'Member')
    )
  );

-- For account_books: Only allow UPDATE if user is Owner or Member (not Viewer)
CREATE POLICY "Owners and Members can update transactions"
  ON transactions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM account_books ab
      WHERE ab.id = transactions.book_id
        AND ab.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1
      FROM book_members bm
      WHERE bm.book_id = transactions.book_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('Owner', 'Member')
    )
  );

-- For ledgers: Only allow DELETE if user is Owner or Member (not Viewer)
CREATE POLICY "Owners and Members can delete transactions in ledgers"
  ON transactions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ledger_members lm
      WHERE lm.ledger_id = transactions.ledger_id
        AND lm.user_id = auth.uid()
        AND lm.role IN ('Owner', 'Member')
    )
  );

-- For account_books: Only allow DELETE if user is Owner or Member (not Viewer)
CREATE POLICY "Owners and Members can delete transactions"
  ON transactions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM account_books ab
      WHERE ab.id = transactions.book_id
        AND ab.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1
      FROM book_members bm
      WHERE bm.book_id = transactions.book_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('Owner', 'Member')
    )
  );

-- Reset schema cache
NOTIFY pgrst, 'reload schema';

