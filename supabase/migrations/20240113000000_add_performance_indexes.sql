-- Add performance indexes for common queries

-- Indexes for transactions table
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_date ON transactions(ledger_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_type ON transactions(ledger_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_type_date ON transactions(ledger_id, type, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_payer ON transactions(payer_id) WHERE payer_id IS NOT NULL;

-- Indexes for transaction_splits table
CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction ON transaction_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_user_ledger ON transaction_splits(user_id, ledger_id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_ledger_user ON transaction_splits(ledger_id, user_id);

-- Indexes for categories table
CREATE INDEX IF NOT EXISTS idx_categories_ledger_type ON categories(ledger_id, type);
CREATE INDEX IF NOT EXISTS idx_categories_ledger ON categories(ledger_id);

-- Indexes for ledger_members table
CREATE INDEX IF NOT EXISTS idx_ledger_members_user ON ledger_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_members_ledger ON ledger_members(ledger_id);

-- Indexes for settlements table
CREATE INDEX IF NOT EXISTS idx_settlements_ledger_date ON settlements(ledger_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_receiver ON settlements(receiver_id) WHERE receiver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settlements_sender ON settlements(sender_id) WHERE sender_id IS NOT NULL;

