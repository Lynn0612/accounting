-- Ensure transaction_splits supports account_books by adding book_id column.
-- Fixes PostgREST error PGRST204 when inserting transaction_splits with book_id.

-- 1) Add book_id column (nullable) if missing
ALTER TABLE public.transaction_splits
ADD COLUMN IF NOT EXISTS book_id UUID;

-- 2) Add FK constraint to account_books if missing (safe in DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_splits_book_id_fkey'
      AND conrelid = 'public.transaction_splits'::regclass
  ) THEN
    ALTER TABLE public.transaction_splits
      ADD CONSTRAINT transaction_splits_book_id_fkey
      FOREIGN KEY (book_id) REFERENCES public.account_books(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 3) Helpful index for queries by book_id
CREATE INDEX IF NOT EXISTS idx_transaction_splits_book_id
ON public.transaction_splits(book_id);

-- 4) Reset PostgREST schema cache
NOTIFY pgrst, 'reload schema';


