-- Fix join_ledger_by_code function to return success: true when already_member
-- This ensures the frontend treats it as a success case, not an error

CREATE OR REPLACE FUNCTION public.join_ledger_by_code(ledger_code UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_uuid UUID;
  ledger_exists BOOLEAN;
  already_member BOOLEAN;
BEGIN
  -- Get current user ID
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'User not authenticated'
    );
  END IF;

  -- Check if ledger exists
  SELECT EXISTS(SELECT 1 FROM public.ledgers WHERE id = ledger_code) INTO ledger_exists;
  
  IF NOT ledger_exists THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invalid invitation code'
    );
  END IF;

  -- Check if user is already a member
  SELECT EXISTS(
    SELECT 1 FROM public.ledger_members 
    WHERE ledger_id = ledger_code 
    AND user_id = user_uuid
  ) INTO already_member;

  IF already_member THEN
    -- Return success: true for already_member case (not an error)
    RETURN json_build_object(
      'success', true,
      'message', 'You are already a member of this ledger',
      'already_member', true
    );
  END IF;

  -- Insert user as a member with 'Member' role
  INSERT INTO public.ledger_members (ledger_id, user_id, role)
  VALUES (ledger_code, user_uuid, 'Member')
  ON CONFLICT (ledger_id, user_id) DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'message', 'Successfully joined the ledger',
    'already_member', false
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Failed to join ledger: ' || SQLERRM
    );
END;
$$;

