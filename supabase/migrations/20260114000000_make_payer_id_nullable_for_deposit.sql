-- Make payer_id nullable for deposit transactions
-- When expense_payment_source is 'deposit', payer_id can be NULL

ALTER TABLE public.transactions
ALTER COLUMN payer_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';

