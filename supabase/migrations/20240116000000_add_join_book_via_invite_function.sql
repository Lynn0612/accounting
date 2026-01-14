-- Create RPC function to securely join a book via invite
-- This function uses SECURITY DEFINER to bypass RLS policies

CREATE OR REPLACE FUNCTION join_book_via_invite(target_book_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  book_exists BOOLEAN;
  already_member BOOLEAN;
  result JSON;
BEGIN
  -- Get the current authenticated user ID
  current_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF current_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'User not authenticated'
    );
  END IF;
  
  -- Check if the book exists (check both account_books and ledgers)
  SELECT EXISTS(
    SELECT 1 FROM account_books WHERE id = target_book_id
    UNION
    SELECT 1 FROM ledgers WHERE id = target_book_id
  ) INTO book_exists;
  
  IF NOT book_exists THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Book not found'
    );
  END IF;
  
  -- Check if user is already a member (check both book_members and ledger_members)
  SELECT EXISTS(
    SELECT 1 FROM book_members 
    WHERE book_id = target_book_id AND user_id = current_user_id
    UNION
    SELECT 1 FROM ledger_members 
    WHERE ledger_id = target_book_id AND user_id = current_user_id
  ) INTO already_member;
  
  IF already_member THEN
    RETURN json_build_object(
      'success', true,
      'message', 'Already a member of this book',
      'already_member', true
    );
  END IF;
  
  -- Check if it's an account_book or ledger
  IF EXISTS(SELECT 1 FROM account_books WHERE id = target_book_id) THEN
    -- Insert the user as a member of account_book
    INSERT INTO book_members (book_id, user_id, role)
    VALUES (target_book_id, current_user_id, 'Member')
    ON CONFLICT (book_id, user_id) DO NOTHING;
  ELSIF EXISTS(SELECT 1 FROM ledgers WHERE id = target_book_id) THEN
    -- Insert the user as a member of ledger
    INSERT INTO ledger_members (ledger_id, user_id, role)
    VALUES (target_book_id, current_user_id, 'Member')
    ON CONFLICT (ledger_id, user_id) DO NOTHING;
  END IF;
  
  -- Check if insert was successful
  IF FOUND THEN
    RETURN json_build_object(
      'success', true,
      'message', 'Successfully joined the book',
      'already_member', false
    );
  ELSE
    RETURN json_build_object(
      'success', false,
      'message', 'Failed to join book'
    );
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'message', 'An error occurred: ' || SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION join_book_via_invite(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION join_book_via_invite(UUID) IS 
  'Securely adds the current authenticated user to a book (account_book or ledger) as a Member. Uses SECURITY DEFINER to bypass RLS.';

