-- Verify table structure and reload PostgREST schema cache
-- This migration verifies that ledgers and account_books tables exist with correct structure
-- and reloads the PostgREST schema cache to fix 406 errors

-- ============================================
-- 1. 驗證 ledgers 表是否存在
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers'
  ) THEN
    RAISE EXCEPTION 'Table "ledgers" does not exist in the database!';
  END IF;
  
  RAISE NOTICE '✓ Table "ledgers" exists';
END $$;

-- ============================================
-- 2. 驗證 account_books 表是否存在
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'account_books'
  ) THEN
    RAISE WARNING 'Table "account_books" does not exist in the database!';
  ELSE
    RAISE NOTICE '✓ Table "account_books" exists';
  END IF;
END $$;

-- ============================================
-- 3. 驗證 ledgers 表的列結構
-- ============================================
DO $$
DECLARE
  has_id BOOLEAN;
  has_name BOOLEAN;
  has_created_at BOOLEAN;
  has_description BOOLEAN;
  has_created_by BOOLEAN;
BEGIN
  -- 檢查 id 列
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers' 
    AND column_name = 'id'
  ) INTO has_id;
  
  -- 檢查 name 列
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers' 
    AND column_name = 'name'
  ) INTO has_name;
  
  -- 檢查 created_at 列
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers' 
    AND column_name = 'created_at'
  ) INTO has_created_at;
  
  -- 檢查 description 列
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers' 
    AND column_name = 'description'
  ) INTO has_description;
  
  -- 檢查 created_by 列
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers' 
    AND column_name = 'created_by'
  ) INTO has_created_by;
  
  -- 報告結果
  IF has_id THEN
    RAISE NOTICE '✓ Column "id" exists in ledgers table';
  ELSE
    RAISE EXCEPTION 'Column "id" is missing in ledgers table!';
  END IF;
  
  IF has_name THEN
    RAISE NOTICE '✓ Column "name" exists in ledgers table';
  ELSE
    RAISE WARNING 'Column "name" is missing in ledgers table!';
  END IF;
  
  IF has_created_at THEN
    RAISE NOTICE '✓ Column "created_at" exists in ledgers table';
  ELSE
    RAISE WARNING 'Column "created_at" is missing in ledgers table!';
  END IF;
  
  IF has_description THEN
    RAISE NOTICE '✓ Column "description" exists in ledgers table';
  ELSE
    RAISE NOTICE 'Column "description" does not exist (optional column)';
  END IF;
  
  IF has_created_by THEN
    RAISE NOTICE '✓ Column "created_by" exists in ledgers table';
  ELSE
    RAISE NOTICE 'Column "created_by" does not exist (optional column)';
  END IF;
END $$;

-- ============================================
-- 4. 確保 ledgers 表有必要的列（如果缺失則添加）
-- ============================================

-- 確保 id 列存在（應該是主鍵，但如果缺失則添加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers' 
    AND column_name = 'id'
  ) THEN
    ALTER TABLE ledgers ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
    RAISE NOTICE 'Added "id" column to ledgers table';
  END IF;
END $$;

-- 確保 name 列存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers' 
    AND column_name = 'name'
  ) THEN
    ALTER TABLE ledgers ADD COLUMN name TEXT NOT NULL DEFAULT '';
    RAISE NOTICE 'Added "name" column to ledgers table';
  END IF;
END $$;

-- 確保 created_at 列存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ledgers' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE ledgers ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added "created_at" column to ledgers table';
  END IF;
END $$;

-- ============================================
-- 5. 確保 RLS 已啟用
-- ============================================
ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. 重新載入 PostgREST schema cache
-- ============================================
-- 這會告訴 Supabase 重新讀取表格結構，通常能解決 406 錯誤
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 7. 驗證完成訊息
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Schema verification and reload complete!';
  RAISE NOTICE 'PostgREST schema cache has been reloaded.';
  RAISE NOTICE 'If you still see 406 errors, check:';
  RAISE NOTICE '1. RLS policies are correctly configured';
  RAISE NOTICE '2. User has proper authentication';
  RAISE NOTICE '3. Table names match in code and database';
  RAISE NOTICE '========================================';
END $$;

