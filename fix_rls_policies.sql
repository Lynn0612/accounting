-- Fix RLS Policies for Ledgers
-- Execute this in Supabase Dashboard SQL Editor

-- 1. Drop all existing policies on ledgers
DROP POLICY IF EXISTS "Users can view ledgers they are members of" ON ledgers;
DROP POLICY IF EXISTS "Users can create ledgers" ON ledgers;
DROP POLICY IF EXISTS "Owners can update ledgers" ON ledgers;
DROP POLICY IF EXISTS "Owners can delete ledgers" ON ledgers;
DROP POLICY IF EXISTS "Users can view their own created ledgers" ON ledgers;

-- 2. Create INSERT policy - Allow all authenticated users to create ledgers
CREATE POLICY "Users can create ledgers"
  ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- 3. Create SELECT policy - Users can see ledgers they created OR are members of
CREATE POLICY "Users can view ledgers they are members of"
  ON ledgers FOR SELECT
  TO authenticated
  USING (
    -- User is the creator
    created_by = auth.uid()
    OR
    -- User is a member
    EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = ledgers.id
      AND ledger_members.user_id = auth.uid()
    )
  );

-- 4. Create UPDATE policy - Owners can update ledgers
CREATE POLICY "Owners can update ledgers"
  ON ledgers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = ledgers.id
      AND ledger_members.user_id = auth.uid()
      AND ledger_members.role = 'Owner'
    )
  );

-- 5. Create DELETE policy - Owners can delete ledgers
CREATE POLICY "Owners can delete ledgers"
  ON ledgers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = ledgers.id
      AND ledger_members.user_id = auth.uid()
      AND ledger_members.role = 'Owner'
    )
  );

-- 6. Fix ledger_members INSERT policy
DROP POLICY IF EXISTS "Owners can add members to ledgers" ON ledger_members;
CREATE POLICY "Owners can add members to ledgers"
  ON ledger_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers
      WHERE ledgers.id = ledger_members.ledger_id
      AND ledgers.created_by = auth.uid()
    )
  );

