-- 更新 categories 表的 type 欄位約束，支援大小寫
-- 在 Supabase SQL Editor 中執行此腳本

-- 移除舊的嚴格限制
ALTER TABLE categories 
DROP CONSTRAINT IF EXISTS categories_type_check;

-- 重新建立支援大小寫的限制
ALTER TABLE categories 
ADD CONSTRAINT categories_type_check 
CHECK (type IN ('Income', 'Expense', 'income', 'expense'));

