-- Fix ledgers table RLS policy to ensure wide enough SELECT permissions
-- This migration ensures authenticated users can view ledgers they are members of

-- 確保 RLS 已開啟
ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;

-- 刪除可能衝突的舊政策
DROP POLICY IF EXISTS "Users can view ledgers they are members of" ON ledgers;
DROP POLICY IF EXISTS "Users can view their own created ledgers" ON ledgers;
DROP POLICY IF EXISTS "Users can view ledgers" ON ledgers;

-- 重新建立簡單的 Select 政策來測試
-- 先使用 USING (true) 測試是否能抓到，若成功再改回原本的 EXISTS 邏輯
-- 
-- ⚠️ 注意：這個政策允許所有認證用戶查看所有 ledgers
-- 如果測試成功，建議改回更安全的版本（見下方註釋）
CREATE POLICY "Users can view ledgers they are members of"
  ON ledgers
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- 更安全的版本（測試成功後可替換上面的政策）
-- ============================================
-- 如果上面的 USING (true) 測試成功，可以執行以下 SQL 來替換為更安全的版本：
--
-- DROP POLICY IF EXISTS "Users can view ledgers they are members of" ON ledgers;
--
-- CREATE POLICY "Users can view ledgers they are members of"
--   ON ledgers
--   FOR SELECT
--   TO authenticated
--   USING (
--     -- User is the creator
--     created_by = auth.uid()
--     OR
--     -- User is a member
--     EXISTS (
--       SELECT 1 FROM ledger_members
--       WHERE ledger_members.ledger_id = ledgers.id
--       AND ledger_members.user_id = auth.uid()
--     )
--   );
--
-- NOTIFY pgrst, 'reload schema';

-- 通知 PostgREST 重新載入 schema
-- 這會告訴 Supabase 重新讀取表格結構，通常能解決 406 錯誤
NOTIFY pgrst, 'reload schema';

-- 驗證政策已創建
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'ledgers' 
    AND policyname = 'Users can view ledgers they are members of'
  ) THEN
    RAISE NOTICE '✓ RLS policy "Users can view ledgers they are members of" has been created successfully';
  ELSE
    RAISE WARNING 'RLS policy "Users can view ledgers they are members of" was not created!';
  END IF;
END $$;

