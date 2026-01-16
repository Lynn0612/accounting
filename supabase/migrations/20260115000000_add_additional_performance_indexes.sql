-- Add additional performance indexes for common queries
-- This migration adds indexes that were identified as missing from performance analysis

-- ============================================
-- transaction_splits 表索引優化
-- ============================================

-- 支持 account_books 的查詢：book_id + user_id
CREATE INDEX IF NOT EXISTS idx_transaction_splits_book_user 
ON transaction_splits(book_id, user_id) 
WHERE book_id IS NOT NULL;

-- 支持 transaction_id + user_id 的組合查詢
CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_user 
ON transaction_splits(transaction_id, user_id);

-- 支持按 ledger_id 和 user_id 查詢，同時過濾特定交易類型
-- 這個索引對於 useLedgerBalance 中的查詢很有用
CREATE INDEX IF NOT EXISTS idx_transaction_splits_ledger_user_amount 
ON transaction_splits(ledger_id, user_id, amount) 
WHERE ledger_id IS NOT NULL;

-- 支持按 book_id 和 user_id 查詢，同時過濾特定交易類型
CREATE INDEX IF NOT EXISTS idx_transaction_splits_book_user_amount 
ON transaction_splits(book_id, user_id, amount) 
WHERE book_id IS NOT NULL;

-- ============================================
-- transactions 表索引優化
-- ============================================

-- 支持 account_books 的查詢：book_id + date
CREATE INDEX IF NOT EXISTS idx_transactions_book_date 
ON transactions(book_id, date DESC) 
WHERE book_id IS NOT NULL;

-- 支持 account_books 的查詢：book_id + type
CREATE INDEX IF NOT EXISTS idx_transactions_book_type 
ON transactions(book_id, type) 
WHERE book_id IS NOT NULL;

-- 支持 account_books 的查詢：book_id + type + date（用於統計查詢）
CREATE INDEX IF NOT EXISTS idx_transactions_book_type_date 
ON transactions(book_id, type, date DESC) 
WHERE book_id IS NOT NULL;

-- 支持按 payer_id 和 type 查詢（用於個人收入查詢）
CREATE INDEX IF NOT EXISTS idx_transactions_payer_type 
ON transactions(payer_id, type) 
WHERE payer_id IS NOT NULL;

-- 支持按 payer_id、type 和 income_mode 查詢（用於個人收入查詢，排除 deposit）
CREATE INDEX IF NOT EXISTS idx_transactions_payer_type_income_mode 
ON transactions(payer_id, type, income_mode) 
WHERE payer_id IS NOT NULL AND type = 'income';

-- 支持按 ledger_id、type 和 expense_payment_source 查詢（用於個人支出查詢，排除 deposit）
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_type_expense_source 
ON transactions(ledger_id, type, expense_payment_source) 
WHERE ledger_id IS NOT NULL AND type = 'expense';

-- 支持按 book_id、type 和 expense_payment_source 查詢
CREATE INDEX IF NOT EXISTS idx_transactions_book_type_expense_source 
ON transactions(book_id, type, expense_payment_source) 
WHERE book_id IS NOT NULL AND type = 'expense';

-- 支持按 created_at 排序的查詢（用於最近交易）
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_created_at 
ON transactions(ledger_id, created_at DESC) 
WHERE ledger_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_book_created_at 
ON transactions(book_id, created_at DESC) 
WHERE book_id IS NOT NULL;

-- ============================================
-- settlements 表索引優化
-- ============================================

-- 支持按 ledger_id 和 receiver_id 查詢（用於個人餘額計算）
CREATE INDEX IF NOT EXISTS idx_settlements_ledger_receiver 
ON settlements(ledger_id, receiver_id) 
WHERE ledger_id IS NOT NULL AND receiver_id IS NOT NULL;

-- 支持按 ledger_id 和 sender_id 查詢（用於個人餘額計算）
CREATE INDEX IF NOT EXISTS idx_settlements_ledger_sender 
ON settlements(ledger_id, sender_id) 
WHERE ledger_id IS NOT NULL AND sender_id IS NOT NULL;

-- 支持按 created_at 排序的查詢（用於最近還款）
CREATE INDEX IF NOT EXISTS idx_settlements_ledger_created_at 
ON settlements(ledger_id, created_at DESC) 
WHERE ledger_id IS NOT NULL;

-- ============================================
-- 通知 PostgREST 重新載入 schema
-- ============================================
NOTIFY pgrst, 'reload schema';

