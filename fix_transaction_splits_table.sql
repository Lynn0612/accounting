-- 修復 transaction_splits 表：新增 ledger_id 欄位並更新 RLS
-- 在 Supabase Dashboard 的 SQL Editor 中執行此腳本

-- 1. 新增 ledger_id 欄位（如果不存在）
ALTER TABLE public.transaction_splits 
ADD COLUMN IF NOT EXISTS ledger_id UUID;

-- 2. 添加外鍵約束（引用 ledgers 表）
DO $$ 
BEGIN
  -- 移除舊的外鍵約束（如果存在）
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'transaction_splits_ledger_id_fkey'
    AND table_name = 'transaction_splits'
  ) THEN
    ALTER TABLE public.transaction_splits 
    DROP CONSTRAINT transaction_splits_ledger_id_fkey;
  END IF;
  
  -- 添加新的外鍵約束（如果 ledgers 表存在）
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers'
  ) THEN
    ALTER TABLE public.transaction_splits 
    ADD CONSTRAINT transaction_splits_ledger_id_fkey 
    FOREIGN KEY (ledger_id) 
    REFERENCES ledgers(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- 3. 建立索引優化查詢
CREATE INDEX IF NOT EXISTS idx_transaction_splits_ledger_id 
ON transaction_splits(ledger_id);

-- 4. 更新現有記錄：從 transactions 表同步 ledger_id
UPDATE transaction_splits ts
SET ledger_id = t.ledger_id
FROM transactions t
WHERE ts.transaction_id = t.id
  AND t.ledger_id IS NOT NULL
  AND ts.ledger_id IS NULL;

-- 5. 確保 RLS 已啟用
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;

-- 6. 刪除現有的 RLS 策略（如果存在）
DROP POLICY IF EXISTS "Allow authenticated access" ON transaction_splits;
DROP POLICY IF EXISTS "Users can manage splits in their books" ON transaction_splits;
DROP POLICY IF EXISTS "Users can manage splits in their ledgers" ON transaction_splits;

-- 7. 創建新的 RLS 策略：支援 ledger_id
CREATE POLICY "Users can manage splits in their ledgers"
  ON transaction_splits FOR ALL
  TO authenticated
  USING (
    -- 如果 ledger_id 存在，檢查用戶是否為該 ledger 的成員
    (ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = transaction_splits.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    -- 如果 ledger_id 為 NULL，檢查是否通過 transaction 關聯到 ledger
    OR (ledger_id IS NULL AND EXISTS (
      SELECT 1 FROM transactions t
      JOIN ledger_members lm ON lm.ledger_id = t.ledger_id
      WHERE t.id = transaction_splits.transaction_id
      AND lm.user_id = auth.uid()
    ))
    -- 向後相容：支援 book_id（如果存在）
    OR EXISTS (
      SELECT 1 FROM transactions t
      JOIN book_members bm ON bm.book_id = t.book_id
      WHERE t.id = transaction_splits.transaction_id
      AND bm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- 插入/更新時也檢查相同的條件
    (ledger_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = transaction_splits.ledger_id
      AND ledger_members.user_id = auth.uid()
    ))
    OR (ledger_id IS NULL AND EXISTS (
      SELECT 1 FROM transactions t
      JOIN ledger_members lm ON lm.ledger_id = t.ledger_id
      WHERE t.id = transaction_splits.transaction_id
      AND lm.user_id = auth.uid()
    ))
    OR EXISTS (
      SELECT 1 FROM transactions t
      JOIN book_members bm ON bm.book_id = t.book_id
      WHERE t.id = transaction_splits.transaction_id
      AND bm.user_id = auth.uid()
    )
  );

-- 8. 重置 Schema Cache（解決快取問題）
NOTIFY pgrst, 'reload schema';

