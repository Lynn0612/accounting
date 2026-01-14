-- Ensure account_books table has owner_id column
-- If the column doesn't exist, add it
-- If it exists but is named user_id, rename it to owner_id

DO $$
BEGIN
  -- Check if owner_id column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'account_books' 
    AND column_name = 'owner_id'
  ) THEN
    -- Check if user_id column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'account_books' 
      AND column_name = 'user_id'
    ) THEN
      -- Rename user_id to owner_id
      ALTER TABLE account_books RENAME COLUMN user_id TO owner_id;
    ELSE
      -- Add owner_id column if neither exists
      ALTER TABLE account_books ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

