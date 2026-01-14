-- Fix Profiles RLS Policy
-- This ensures users can only view their own profile, not all profiles

-- 1. Enable RLS (if not already enabled)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies that allow viewing all profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow authenticated access" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

-- 3. Create policy that only allows users to view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 4. Keep existing policies for UPDATE and INSERT (users can update/insert their own profile)
-- These should already exist, but we'll ensure they're correct
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
-- console.log('Session user ID:', session?.user?.id)
-- 
-- // Should only return current user's profile
-- const { data, error } = await supabase.from('profiles').select('*')
-- console.log('Profiles (should only be current user):', data)
-- console.log('Error:', error)

