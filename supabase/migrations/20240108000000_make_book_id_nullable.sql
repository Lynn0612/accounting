-- Make book_id nullable in transactions table
-- Since we're now using ledger_id instead of book_id, we need to allow NULL values

-- 1. 讓 book_id 允許為空值 (因為我們現在改用 ledger_id)
ALTER TABLE transactions 
ALTER COLUMN book_id DROP NOT NULL;

-- 2. 確保 ledger_id 欄位存在 (如果之前沒加成功的話)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE;

