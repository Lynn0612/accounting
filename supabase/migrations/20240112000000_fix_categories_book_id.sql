-- Fix categories table: make book_id nullable
-- Since we're now using ledger_id instead of book_id, we need to allow NULL values

-- 1. Add book_id column if it doesn't exist (nullable)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'categories' 
    AND column_name = 'book_id'
  ) THEN
    ALTER TABLE categories 
    ADD COLUMN book_id UUID REFERENCES account_books(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Make book_id nullable (if it has NOT NULL constraint)
DO $$ 
BEGIN
  -- Check if book_id has NOT NULL constraint
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'categories' 
    AND column_name = 'book_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE categories 
    ALTER COLUMN book_id DROP NOT NULL;
  END IF;
END $$;

-- 3. Ensure ledger_id can be null initially (for backward compatibility)
-- But we'll require either ledger_id or book_id to be set
-- This is handled at application level

