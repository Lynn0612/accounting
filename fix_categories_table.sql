-- 修復 categories 表：將 book_id 重命名為 ledger_id，統一使用 ledger_id
-- 直接在 Supabase Dashboard 的 SQL Editor 中執行此腳本

-- 1. 確保 categories 表存在
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 如果欄位名還是 book_id，將其改名為 ledger_id
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'categories' 
    AND column_name = 'book_id'
  ) THEN
    ALTER TABLE public.categories 
    RENAME COLUMN book_id TO ledger_id;
  END IF;
END $$;

-- 更新外鍵約束（如果存在舊的 book_id 外鍵）
DO $$ 
BEGIN
  -- 移除舊的 book_id 外鍵約束
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'categories_book_id_fkey'
    AND table_name = 'categories'
  ) THEN
    ALTER TABLE public.categories 
    DROP CONSTRAINT categories_book_id_fkey;
  END IF;
  
  -- 添加新的 ledger_id 外鍵約束（如果不存在）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'categories_ledger_id_fkey'
    AND table_name = 'categories'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'categories' 
    AND column_name = 'ledger_id'
  ) THEN
    ALTER TABLE public.categories 
    ADD CONSTRAINT categories_ledger_id_fkey 
    FOREIGN KEY (ledger_id) 
    REFERENCES ledgers(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- 3. 如果 ledger_id 欄位不存在，添加它
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'categories' 
    AND column_name = 'ledger_id'
  ) THEN
    ALTER TABLE public.categories 
    ADD COLUMN ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. 修正 type 欄位的 CHECK 約束（支援大小寫）
-- 移除舊的嚴格限制
ALTER TABLE categories 
DROP CONSTRAINT IF EXISTS categories_type_check;

-- 重新建立支援大小寫的限制
ALTER TABLE categories 
ADD CONSTRAINT categories_type_check 
CHECK (type IN ('Income', 'Expense', 'income', 'expense'));

-- 5. 添加唯一約束（如果不存在）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'categories_ledger_id_name_type_key'
    AND table_name = 'categories'
  ) THEN
    ALTER TABLE categories 
    ADD CONSTRAINT categories_ledger_id_name_type_key 
    UNIQUE(ledger_id, name, type);
  END IF;
END $$;

-- 6. 啟用 RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 7. 刪除現有的 RLS 策略（如果存在）
DROP POLICY IF EXISTS "Users can view categories in their ledgers" ON categories;
DROP POLICY IF EXISTS "Users can create categories in their ledgers" ON categories;
DROP POLICY IF EXISTS "Users can update categories in their ledgers" ON categories;
DROP POLICY IF EXISTS "Users can delete categories in their ledgers" ON categories;

-- 8. 創建 RLS 策略：支援 ledger_id（允許 NULL 以向後相容）
CREATE POLICY "Users can view categories of their ledgers"
  ON categories FOR SELECT
  TO authenticated
  USING (
    ledger_id IS NULL OR EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = categories.ledger_id
      AND ledger_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert categories to their ledgers"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (
    ledger_id IS NULL OR EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = categories.ledger_id
      AND ledger_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update categories in their ledgers"
  ON categories FOR UPDATE
  TO authenticated
  USING (
    ledger_id IS NULL OR EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = categories.ledger_id
      AND ledger_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete categories in their ledgers"
  ON categories FOR DELETE
  TO authenticated
  USING (
    ledger_id IS NULL OR EXISTS (
      SELECT 1 FROM ledger_members
      WHERE ledger_members.ledger_id = categories.ledger_id
      AND ledger_members.user_id = auth.uid()
    )
  );

-- 9. 創建索引以提升效能
CREATE INDEX IF NOT EXISTS idx_categories_ledger_id ON categories(ledger_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

-- 10. 授予權限
GRANT ALL ON categories TO authenticated;

