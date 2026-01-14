-- Create categories table with ledger_id support
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add book_id column if it doesn't exist (nullable for backward compatibility)
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

-- Make book_id nullable (if it has NOT NULL constraint)
DO $$ 
BEGIN
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

-- Add ledger_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'categories' 
    AND column_name = 'ledger_id'
  ) THEN
    ALTER TABLE categories 
    ADD COLUMN ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add unique constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'categories_ledger_id_name_type_key'
    AND table_name = 'categories'
  ) THEN
    ALTER TABLE categories 
    ADD CONSTRAINT categories_ledger_id_name_type_key 
    UNIQUE(ledger_id, name, type);
  END IF;
END $$;

-- Enable RLS on categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for categories
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view categories in their ledgers" ON categories;
DROP POLICY IF EXISTS "Users can create categories in their ledgers" ON categories;
DROP POLICY IF EXISTS "Users can update categories in their ledgers" ON categories;
DROP POLICY IF EXISTS "Users can delete categories in their ledgers" ON categories;

-- Users can view categories for ledgers they are members of OR books they own
CREATE POLICY "Users can view categories in their ledgers"
  ON categories FOR SELECT
  USING (
    -- For ledger-based categories
    (categories.ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = categories.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    OR
    -- For book-based categories (backward compatibility)
    (categories.book_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM account_books
      WHERE account_books.id = categories.book_id
      AND account_books.owner_id = auth.uid()
    ))
  );

-- Users can create categories for ledgers they are members of OR books they own
CREATE POLICY "Users can create categories in their ledgers"
  ON categories FOR INSERT
  WITH CHECK (
    -- For ledger-based categories
    (categories.ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = categories.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    OR
    -- For book-based categories (backward compatibility)
    (categories.book_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM account_books
      WHERE account_books.id = categories.book_id
      AND account_books.owner_id = auth.uid()
    ))
  );

-- Users can update categories for ledgers they are members of OR books they own
CREATE POLICY "Users can update categories in their ledgers"
  ON categories FOR UPDATE
  USING (
    -- For ledger-based categories
    (categories.ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = categories.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    OR
    -- For book-based categories (backward compatibility)
    (categories.book_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM account_books
      WHERE account_books.id = categories.book_id
      AND account_books.owner_id = auth.uid()
    ))
  );

-- Users can delete categories for ledgers they are members of OR books they own
CREATE POLICY "Users can delete categories in their ledgers"
  ON categories FOR DELETE
  USING (
    -- For ledger-based categories
    (categories.ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = categories.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    OR
    -- For book-based categories (backward compatibility)
    (categories.book_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM account_books
      WHERE account_books.id = categories.book_id
      AND account_books.owner_id = auth.uid()
    ))
  );

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_categories_ledger_id ON categories(ledger_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

-- Grant permissions
GRANT ALL ON categories TO authenticated;

