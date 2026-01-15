-- Add column if not exists
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS expense_payment_source text NOT NULL DEFAULT 'personal';

-- Add constraint only if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'transactions_expense_payment_source_check'
  ) THEN
    ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_expense_payment_source_check
    CHECK (expense_payment_source IN ('personal','deposit'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';


