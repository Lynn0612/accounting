-- Remove old add_default_categories function and all possible triggers if they exist
-- This migration removes the database trigger that automatically creates default categories
-- when account_books are created, since we now handle this in the frontend

-- First, drop the function with CASCADE to automatically drop any dependent triggers
-- This is the safest approach as it will remove the function and all triggers that use it
DROP FUNCTION IF EXISTS public.add_default_categories() CASCADE;
DROP FUNCTION IF EXISTS add_default_categories() CASCADE;

-- Also explicitly try to drop common trigger names that might exist
-- (These will fail silently if they don't exist, which is fine)
DROP TRIGGER IF EXISTS add_default_categories_trigger ON account_books;
DROP TRIGGER IF EXISTS on_account_book_created_add_default_categories ON account_books;
DROP TRIGGER IF EXISTS add_default_categories ON account_books;
DROP TRIGGER IF EXISTS on_account_book_created ON account_books;

-- Additional cleanup: Find and drop any remaining triggers on account_books
-- that might be calling add_default_categories or similar functions
-- This queries pg_trigger to find all AFTER INSERT triggers on account_books
DO $$
DECLARE
  trigger_name TEXT;
BEGIN
  -- Find all AFTER INSERT triggers on account_books that call functions with 'default' or 'category' in the name
  FOR trigger_name IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE c.relname = 'account_books'
      AND (t.tgtype::int & 2) = 2  -- AFTER trigger (bit 1 is set)
      AND (t.tgtype::int & 4) = 4  -- INSERT trigger (bit 2 is set)
      AND NOT t.tgisinternal
      AND (
        p.proname ILIKE '%default%category%'
        OR p.proname ILIKE '%add_default%'
        OR t.tgname ILIKE '%default%category%'
        OR t.tgname ILIKE '%add_default%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON account_books CASCADE', trigger_name);
    RAISE NOTICE 'Dropped trigger: %', trigger_name;
  END LOOP;
END $$;

