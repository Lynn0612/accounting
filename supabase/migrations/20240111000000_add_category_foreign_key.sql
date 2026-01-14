-- Add foreign key constraint for category_id in transactions table
-- This ensures data consistency between transactions and categories

-- First, check if category_id column exists and add it if not
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS category_id UUID;

-- Add foreign key constraint (if not exists)
-- Note: This will fail if there are existing transactions with invalid category_id
-- In that case, you may need to clean up invalid references first

DO $$ 
BEGIN
  -- Check if foreign key constraint already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'transactions_category_id_fkey'
    AND table_name = 'transactions'
  ) THEN
    -- Add foreign key constraint
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_category_id_fkey
    FOREIGN KEY (category_id) 
    REFERENCES categories(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);

