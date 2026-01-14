-- Test RLS Policies for profiles table
-- This file documents the expected RLS policies

-- 1. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies that allow SELECT for all users
DROP POLICY IF EXISTS "Allow authenticated access" ON profiles;
DROP POLICY IF EXISTS "Allow all authenticated users to view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- 3. Create policy that only allows users to view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 4. Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- 5. Allow users to insert their own profile (usually handled by trigger)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Verification queries (run these via API client, NOT SQL Editor):
-- 
-- const { data: session } = await supabase.auth.getSession()
-- console.log('Session:', session)
-- 
-- // Should only return current user's profile
-- const { data, error } = await supabase.from('profiles').select('*')
-- console.log('Profiles (should only be current user):', data)
-- console.log('Error:', error)

