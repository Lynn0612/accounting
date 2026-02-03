-- Add CASCADE DELETE for settlements and members tables
-- This ensures that when account_books or ledgers are deleted,
-- related settlements and members are automatically deleted

-- ============================================
-- 1. 處理 settlements 表的 CASCADE 刪除
-- ============================================
-- settlements.ledger_id 可以引用 ledgers.id 或 account_books.id
-- 由於一個欄位不能同時有兩個外鍵約束，我們使用觸發器來實現 CASCADE 刪除

-- 創建函數：當刪除 ledger 時，刪除相關的 settlements
CREATE OR REPLACE FUNCTION delete_settlements_on_ledger_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM settlements WHERE ledger_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 創建函數：當刪除 account_book 時，刪除相關的 settlements
CREATE OR REPLACE FUNCTION delete_settlements_on_account_book_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM settlements WHERE ledger_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 創建觸發器：當刪除 ledger 時觸發
DROP TRIGGER IF EXISTS trigger_delete_settlements_on_ledger_delete ON ledgers;
CREATE TRIGGER trigger_delete_settlements_on_ledger_delete
  BEFORE DELETE ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION delete_settlements_on_ledger_delete();

-- 創建觸發器：當刪除 account_book 時觸發
DROP TRIGGER IF EXISTS trigger_delete_settlements_on_account_book_delete ON account_books;
CREATE TRIGGER trigger_delete_settlements_on_account_book_delete
  BEFORE DELETE ON account_books
  FOR EACH ROW
  EXECUTE FUNCTION delete_settlements_on_account_book_delete();

-- ============================================
-- 2. 處理 ledger_members 表的 CASCADE 刪除
-- ============================================
-- 當刪除 ledger 時，自動刪除相關的 ledger_members

DO $$
BEGIN
  -- 刪除舊的約束（如果存在）
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ledger_members_ledger_id_fkey' 
    AND conrelid = 'ledger_members'::regclass
  ) THEN
    ALTER TABLE ledger_members 
    DROP CONSTRAINT ledger_members_ledger_id_fkey;
  END IF;
  
  -- 添加新的 CASCADE 約束
  ALTER TABLE ledger_members
  ADD CONSTRAINT ledger_members_ledger_id_fkey 
  FOREIGN KEY (ledger_id) 
  REFERENCES ledgers(id) 
  ON DELETE CASCADE;
END $$;

-- ============================================
-- 3. 處理 book_members 表的 CASCADE 刪除
-- ============================================
-- 當刪除 account_book 時，自動刪除相關的 book_members

DO $$
BEGIN
  -- 刪除舊的約束（如果存在）
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'book_members_book_id_fkey' 
    AND conrelid = 'book_members'::regclass
  ) THEN
    ALTER TABLE book_members 
    DROP CONSTRAINT book_members_book_id_fkey;
  END IF;
  
  -- 添加新的 CASCADE 約束
  ALTER TABLE book_members
  ADD CONSTRAINT book_members_book_id_fkey 
  FOREIGN KEY (book_id) 
  REFERENCES account_books(id) 
  ON DELETE CASCADE;
END $$;

-- ============================================
-- 4. 處理 transactions 表的 book_id CASCADE 刪除
-- ============================================
-- 當刪除 account_book 時，自動刪除相關的 transactions
-- 注意：transactions.ledger_id 已經有 CASCADE（在之前的 migration 中）

DO $$
BEGIN
  -- 檢查 transactions.book_id 是否已有外鍵約束
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'transactions_book_id_fkey' 
    AND conrelid = 'transactions'::regclass
  ) THEN
    -- 刪除舊的約束（如果沒有 CASCADE）
    ALTER TABLE transactions 
    DROP CONSTRAINT transactions_book_id_fkey;
  END IF;
  
  -- 添加新的 CASCADE 約束（如果 book_id 欄位存在）
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'transactions' 
    AND column_name = 'book_id'
  ) THEN
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_book_id_fkey 
    FOREIGN KEY (book_id) 
    REFERENCES account_books(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================
-- 5. 驗證設置
-- ============================================
-- 檢查觸發器是否創建成功
DO $$
DECLARE
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO trigger_count
  FROM pg_trigger
  WHERE tgname IN (
    'trigger_delete_settlements_on_ledger_delete',
    'trigger_delete_settlements_on_account_book_delete'
  );
  
  IF trigger_count = 2 THEN
    RAISE NOTICE 'Successfully created CASCADE delete triggers for settlements';
  ELSE
    RAISE WARNING 'Some triggers may not have been created. Count: %', trigger_count;
  END IF;
END $$;

