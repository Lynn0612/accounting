-- Add is_notify_enabled column to ledger_members and book_members tables

-- Add to ledger_members
ALTER TABLE public.ledger_members 
ADD COLUMN IF NOT EXISTS is_notify_enabled BOOLEAN DEFAULT false;

-- Add to book_members
ALTER TABLE public.book_members 
ADD COLUMN IF NOT EXISTS is_notify_enabled BOOLEAN DEFAULT false;

-- Create function to get all users with notifications enabled
CREATE OR REPLACE FUNCTION get_all_notify_users()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT x.user_id FROM (
    SELECT user_id FROM public.ledger_members WHERE is_notify_enabled = true
    UNION
    SELECT user_id FROM public.book_members WHERE is_notify_enabled = true
  ) x;
$$;

-- Create function to get all ledgers/books for a user with notifications enabled
CREATE OR REPLACE FUNCTION get_user_notify_ledgers(uid uuid)
RETURNS TABLE(id uuid, name text, type text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT l.id, l.name, 'ledger'::text as type 
  FROM public.ledger_members m
  JOIN public.ledgers l ON l.id = m.ledger_id
  WHERE m.user_id = uid AND m.is_notify_enabled = true

  UNION

  SELECT b.id, b.name, 'account_book'::text as type 
  FROM public.book_members m
  JOIN public.account_books b ON b.id = m.book_id
  WHERE m.user_id = uid AND m.is_notify_enabled = true;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_all_notify_users() TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_notify_users() TO service_role;
GRANT EXECUTE ON FUNCTION get_user_notify_ledgers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_notify_ledgers(uuid) TO service_role;

