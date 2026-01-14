CREATE OR REPLACE FUNCTION public.can_view_book(book_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF user_uuid IS NULL OR book_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.account_books ab
    WHERE ab.id = book_uuid
      AND ab.owner_id = user_uuid
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.book_members bm
    WHERE bm.book_id = book_uuid
      AND bm.user_id = user_uuid
      AND bm.role IN ('Owner', 'Member', 'Viewer')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_edit_book(book_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF user_uuid IS NULL OR book_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.account_books ab
    WHERE ab.id = book_uuid
      AND ab.owner_id = user_uuid
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.book_members bm
    WHERE bm.book_id = book_uuid
      AND bm.user_id = user_uuid
      AND bm.role IN ('Owner', 'Member')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view transactions in their ledgers or books" ON public.transactions;
DROP POLICY IF EXISTS "Users can create transactions in their ledgers or books" ON public.transactions;
DROP POLICY IF EXISTS "Users can update transactions in their ledgers or books" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete transactions in their ledgers or books" ON public.transactions;

DROP POLICY IF EXISTS "Owners and Members can create transactions in ledgers" ON public.transactions;
DROP POLICY IF EXISTS "Owners and Members can create transactions in account_books" ON public.transactions;
DROP POLICY IF EXISTS "Owners and Members can update transactions in ledgers" ON public.transactions;
DROP POLICY IF EXISTS "Owners and Members can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Owners and Members can delete transactions in ledgers" ON public.transactions;
DROP POLICY IF EXISTS "Owners and Members can delete transactions" ON public.transactions;

CREATE POLICY "Users can view transactions"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    (
      transactions.ledger_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.ledger_members lm
        WHERE lm.ledger_id = transactions.ledger_id
          AND lm.user_id = auth.uid()
          AND lm.role IN ('Owner', 'Member', 'Viewer')
      )
    )
    OR
    (
      transactions.book_id IS NOT NULL
      AND public.can_view_book(transactions.book_id, auth.uid())
    )
  );

CREATE POLICY "Owners and Members can create transactions"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      transactions.ledger_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.ledger_members lm
        WHERE lm.ledger_id = transactions.ledger_id
          AND lm.user_id = auth.uid()
          AND lm.role IN ('Owner', 'Member')
      )
    )
    OR
    (
      transactions.book_id IS NOT NULL
      AND public.can_edit_book(transactions.book_id, auth.uid())
    )
  );

CREATE POLICY "Owners and Members can update transactions"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    (
      transactions.ledger_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.ledger_members lm
        WHERE lm.ledger_id = transactions.ledger_id
          AND lm.user_id = auth.uid()
          AND lm.role IN ('Owner', 'Member')
      )
    )
    OR
    (
      transactions.book_id IS NOT NULL
      AND public.can_edit_book(transactions.book_id, auth.uid())
    )
  );

CREATE POLICY "Owners and Members can delete transactions"
  ON public.transactions
  FOR DELETE
  TO authenticated
  USING (
    (
      transactions.ledger_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.ledger_members lm
        WHERE lm.ledger_id = transactions.ledger_id
          AND lm.user_id = auth.uid()
          AND lm.role IN ('Owner', 'Member')
      )
    )
    OR
    (
      transactions.book_id IS NOT NULL
      AND public.can_edit_book(transactions.book_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view transaction_splits" ON public.transaction_splits;
DROP POLICY IF EXISTS "Owners and Members can create transaction_splits" ON public.transaction_splits;
DROP POLICY IF EXISTS "Owners and Members can update transaction_splits" ON public.transaction_splits;
DROP POLICY IF EXISTS "Owners and Members can delete transaction_splits" ON public.transaction_splits;

CREATE POLICY "Users can view transaction_splits"
  ON public.transaction_splits
  FOR SELECT
  TO authenticated
  USING (
    (
      transaction_splits.ledger_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.ledger_members lm
        WHERE lm.ledger_id = transaction_splits.ledger_id
          AND lm.user_id = auth.uid()
          AND lm.role IN ('Owner', 'Member', 'Viewer')
      )
    )
    OR
    (
      transaction_splits.book_id IS NOT NULL
      AND public.can_view_book(transaction_splits.book_id, auth.uid())
    )
  );

CREATE POLICY "Owners and Members can create transaction_splits"
  ON public.transaction_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      transaction_splits.ledger_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.ledger_members lm
        WHERE lm.ledger_id = transaction_splits.ledger_id
          AND lm.user_id = auth.uid()
          AND lm.role IN ('Owner', 'Member')
      )
    )
    OR
    (
      transaction_splits.book_id IS NOT NULL
      AND public.can_edit_book(transaction_splits.book_id, auth.uid())
    )
  );

CREATE POLICY "Owners and Members can update transaction_splits"
  ON public.transaction_splits
  FOR UPDATE
  TO authenticated
  USING (
    (
      transaction_splits.ledger_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.ledger_members lm
        WHERE lm.ledger_id = transaction_splits.ledger_id
          AND lm.user_id = auth.uid()
          AND lm.role IN ('Owner', 'Member')
      )
    )
    OR
    (
      transaction_splits.book_id IS NOT NULL
      AND public.can_edit_book(transaction_splits.book_id, auth.uid())
    )
  );

CREATE POLICY "Owners and Members can delete transaction_splits"
  ON public.transaction_splits
  FOR DELETE
  TO authenticated
  USING (
    (
      transaction_splits.ledger_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.ledger_members lm
        WHERE lm.ledger_id = transaction_splits.ledger_id
          AND lm.user_id = auth.uid()
          AND lm.role IN ('Owner', 'Member')
      )
    )
    OR
    (
      transaction_splits.book_id IS NOT NULL
      AND public.can_edit_book(transaction_splits.book_id, auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';

