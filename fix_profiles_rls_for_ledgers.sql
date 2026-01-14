-- Fix Profiles RLS Policy to allow viewing profiles of ledger/book members
-- This allows users to see names and avatars of other members in the same ledger/book

-- 1. Enable RLS (if not already enabled)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policy
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow authenticated access" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

-- 3. Create policy that allows users to view:
--    a) Their own profile
--    b) Profiles of users who are members of the same ledger
--    c) Profiles of users who are members of the same account_book
CREATE POLICY "Users can view own profile and ledger/book members"
  ON profiles
  FOR SELECT
  USING (
    -- User can view their own profile
    auth.uid() = id
    OR
    -- User can view profiles of users in the same ledger
    EXISTS (
      SELECT 1
      FROM ledger_members lm1
      INNER JOIN ledger_members lm2 ON lm1.ledger_id = lm2.ledger_id
      WHERE lm1.user_id = auth.uid()
        AND lm2.user_id = profiles.id
    )
    OR
    -- User can view profiles of users in the same account_book
    EXISTS (
      SELECT 1
      FROM book_members bm1
      INNER JOIN book_members bm2 ON bm1.book_id = bm2.book_id
      WHERE bm1.user_id = auth.uid()
        AND bm2.user_id = profiles.id
    )
  );

-- 4. Keep existing policies for UPDATE and INSERT (users can update/insert their own profile)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Verification:
-- After running this, test via API client (NOT SQL Editor):
-- 
-- const { data: session } = await supabase.auth.getSession()
-- console.log('Session:', session)
-- 
-- // Should return current user's profile AND profiles of users in the same ledger/book
-- const { data, error } = await supabase.from('profiles').select('*')
-- console.log('Profiles:', data)
-- console.log('Error:', error)

