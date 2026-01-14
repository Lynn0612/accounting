ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS is_public_expense boolean NOT NULL DEFAULT false;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS public_amount integer;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS public_share_participant_ids uuid[];

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS split_with_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS split_with_amounts jsonb;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS income_kind text;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS income_mode text NOT NULL DEFAULT 'personal';

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_income_mode_check
CHECK (income_mode IN ('personal','deposit','bonus','refund'));

NOTIFY pgrst, 'reload schema';

