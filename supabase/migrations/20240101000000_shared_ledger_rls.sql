-- Shared Ledger RLS Migration
-- Creates tables and RLS policies for shared expense functionality

-- 1. Create profiles table (if not exists) linked to auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix column name inconsistency: rename display_name to full_name if it exists
DO $$ 
BEGIN
  -- Check if display_name column exists and rename it to full_name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'display_name'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN display_name TO full_name;
  END IF;
  
  -- Ensure full_name column exists (add if missing)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN full_name TEXT;
  END IF;
END $$;

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Profiles RLS: Users can read all profiles, but only update their own
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. Create ledgers table
CREATE TABLE IF NOT EXISTS ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add created_by column if it doesn't exist (for existing tables)
ALTER TABLE ledgers 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Enable RLS on ledgers
ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;

-- 3. Create ledger_members table
CREATE TABLE IF NOT EXISTS ledger_members (
  ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'Member' CHECK (role IN ('Owner', 'Member', 'Viewer')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ledger_id, user_id)
);

-- Enable RLS on ledger_members
ALTER TABLE ledger_members ENABLE ROW LEVEL SECURITY;

-- 4. Note: transactions table already exists with book_id
-- We will add ledger_id column if needed later, or create a separate table
-- For now, we'll skip creating transactions table to avoid conflicts

-- 5. RLS Policies for ledgers
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view ledgers they are members of" ON ledgers;
DROP POLICY IF EXISTS "Users can create ledgers" ON ledgers;
DROP POLICY IF EXISTS "Owners can update ledgers" ON ledgers;
DROP POLICY IF EXISTS "Owners can delete ledgers" ON ledgers;
DROP POLICY IF EXISTS "Users can view their own created ledgers" ON ledgers;

-- Users can create ledgers (MUST be first to allow creation)
-- Allow all authenticated users to create ledgers
-- (The member relationship will be automatically handled by the trigger)
CREATE POLICY "Users can create ledgers"
  ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- Users can view ledgers they created OR are members of
-- This ensures newly created ledgers are visible immediately
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

-- Users can update ledgers they own
CREATE POLICY "Owners can update ledgers"
  ON ledgers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = ledgers.id
      AND ledger_members.user_id = auth.uid()
      AND ledger_members.role = 'Owner'
    )
  );

-- Users can delete ledgers they own
CREATE POLICY "Owners can delete ledgers"
  ON ledgers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = ledgers.id
      AND ledger_members.user_id = auth.uid()
      AND ledger_members.role = 'Owner'
    )
  );

-- 6. RLS Policies for ledger_members
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view members of their ledgers" ON ledger_members;
DROP POLICY IF EXISTS "Owners can add members to ledgers" ON ledger_members;
DROP POLICY IF EXISTS "Owners can update member roles" ON ledger_members;
DROP POLICY IF EXISTS "Owners can remove members" ON ledger_members;

-- Users can view members of ledgers they belong to
-- Use a function to check membership to avoid infinite recursion
CREATE OR REPLACE FUNCTION is_ledger_member(ledger_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is creator
  IF EXISTS (
    SELECT 1 FROM ledgers
    WHERE ledgers.id = ledger_uuid
    AND ledgers.created_by = user_uuid
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is a member (with RLS disabled for this check)
  RETURN EXISTS (
    SELECT 1 FROM ledger_members
    WHERE ledger_members.ledger_id = ledger_uuid
    AND ledger_members.user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE POLICY "Users can view members of their ledgers"
  ON ledger_members FOR SELECT
  USING (is_ledger_member(ledger_members.ledger_id, auth.uid()));

-- Users can add members to ledgers they own
-- Check ledgers.created_by to avoid infinite recursion
-- SECURITY DEFINER functions (like our trigger) will bypass this policy
CREATE POLICY "Owners can add members to ledgers"
  ON ledger_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User is the creator of the ledger
    EXISTS (
      SELECT 1 FROM ledgers
      WHERE ledgers.id = ledger_members.ledger_id
      AND ledgers.created_by = auth.uid()
    )
  );

-- Owners can update member roles
CREATE POLICY "Owners can update member roles"
  ON ledger_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ledger_members lm
      WHERE lm.ledger_id = ledger_members.ledger_id
      AND lm.user_id = auth.uid()
      AND lm.role = 'Owner'
    )
  );

-- Owners can remove members (except themselves)
CREATE POLICY "Owners can remove members"
  ON ledger_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = ledger_members.ledger_id
      AND ledger_members.user_id = auth.uid()
      AND ledger_members.role = 'Owner'
    )
    AND ledger_members.user_id != auth.uid()
  );

-- 7. RLS Policies for transactions
-- Note: If you want to use transactions with ledgers, you need to:
-- 1. Add ledger_id column to existing transactions table: ALTER TABLE transactions ADD COLUMN ledger_id UUID REFERENCES ledgers(id);
-- 2. Then uncomment and run these policies

-- Users can only see transactions for ledgers they are members of
-- CREATE POLICY "Users can view transactions in their ledgers"
--   ON transactions FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM ledger_members
--       WHERE ledger_members.ledger_id = transactions.ledger_id
--       AND ledger_members.user_id = auth.uid()
--     )
--   );

-- Users can create transactions for ledgers they are members of
-- CREATE POLICY "Users can create transactions in their ledgers"
--   ON transactions FOR INSERT
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM ledger_members
--       WHERE ledger_members.ledger_id = transactions.ledger_id
--       AND ledger_members.user_id = auth.uid()
--     )
--   );

-- Users can update transactions in ledgers they are members of
-- CREATE POLICY "Users can update transactions in their ledgers"
--   ON transactions FOR UPDATE
--   USING (
--     EXISTS (
--       SELECT 1 FROM ledger_members
--       WHERE ledger_members.ledger_id = transactions.ledger_id
--       AND ledger_members.user_id = auth.uid()
--     )
--   );

-- Users can delete transactions in ledgers they are members of
-- CREATE POLICY "Users can delete transactions in their ledgers"
--   ON transactions FOR DELETE
--   USING (
--     EXISTS (
--       SELECT 1 FROM ledger_members
--       WHERE ledger_members.ledger_id = transactions.ledger_id
--       AND ledger_members.user_id = auth.uid()
--     )
--   );

-- 8. Function to automatically set created_by when creating a ledger
CREATE OR REPLACE FUNCTION set_ledger_created_by()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- Ensure profile exists for the user (profiles.id should match auth.users.id)
  -- If profile doesn't exist, create it
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (current_user_id, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
  
  -- Set created_by to current user's ID (which should match profiles.id)
  NEW.created_by := current_user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add creator to ledger_members after ledger is created
-- This function bypasses RLS by using SECURITY DEFINER
-- SECURITY DEFINER functions run with the privileges of the function owner (postgres)
-- which bypasses RLS policies
CREATE OR REPLACE FUNCTION add_creator_to_ledger_members()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE WARNING 'auth.uid() is NULL in add_creator_to_ledger_members';
    RETURN NEW;
  END IF;
  
  -- Insert the creator as Owner
  -- SECURITY DEFINER allows this to bypass RLS
  INSERT INTO ledger_members (ledger_id, user_id, role)
  VALUES (NEW.id, current_user_id, 'Owner')
  ON CONFLICT (ledger_id, user_id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- If insertion fails, log but don't block ledger creation
    RAISE WARNING 'Failed to add creator to ledger_members: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers if they exist (to avoid conflicts)
DROP TRIGGER IF EXISTS on_ledger_created_set_creator ON ledgers;
DROP TRIGGER IF EXISTS on_ledger_created_add_member ON ledgers;
DROP TRIGGER IF EXISTS on_ledger_insert_set_creator ON ledgers;
DROP TRIGGER IF EXISTS on_ledger_created_add_owner ON ledgers;

-- Trigger to set created_by before insert
CREATE TRIGGER on_ledger_created_set_creator
  BEFORE INSERT ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION set_ledger_created_by();

-- Trigger to add creator to ledger_members after insert
CREATE TRIGGER on_ledger_created_add_member
  AFTER INSERT ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION add_creator_to_ledger_members();

-- 9. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ledger_members_user_id ON ledger_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_members_ledger_id ON ledger_members(ledger_id);
-- Note: Transaction indexes will be created when ledger_id column is added
-- CREATE INDEX IF NOT EXISTS idx_transactions_ledger_id ON transactions(ledger_id);

-- 10. Optional: Add ledger_id to existing transactions table
-- Uncomment the following lines if you want to use transactions with ledgers:
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE;
-- CREATE INDEX IF NOT EXISTS idx_transactions_ledger_id ON transactions(ledger_id);

-- 11. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ledgers TO authenticated;
GRANT ALL ON ledger_members TO authenticated;
GRANT ALL ON profiles TO authenticated;
-- Note: transactions permissions are already granted if table exists

