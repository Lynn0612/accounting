ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS expense_payment_source text NOT NULL DEFAULT 'personal';

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_expense_payment_source_check
CHECK (expense_payment_source IN ('personal','deposit'));

NOTIFY pgrst, 'reload schema';


