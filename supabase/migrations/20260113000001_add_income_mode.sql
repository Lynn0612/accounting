ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS income_mode text NOT NULL DEFAULT 'personal';

NOTIFY pgrst, 'reload schema';

