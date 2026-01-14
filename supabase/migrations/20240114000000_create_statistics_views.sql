-- Create materialized views for statistics calculations
-- These views pre-calculate common statistics to improve query performance

-- View for monthly transaction statistics by category
CREATE OR REPLACE VIEW monthly_category_stats AS
SELECT 
  t.ledger_id,
  DATE_TRUNC('month', t.date) AS month,
  t.type,
  c.id AS category_id,
  c.name AS category_name,
  c.icon AS category_icon,
  COUNT(*) AS transaction_count,
  SUM(t.amount) AS total_amount
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.category_id IS NOT NULL
GROUP BY t.ledger_id, DATE_TRUNC('month', t.date), t.type, c.id, c.name, c.icon;

-- View for ledger balance summary
CREATE OR REPLACE VIEW ledger_balance_summary AS
SELECT 
  ledger_id,
  SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expense,
  SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS balance,
  COUNT(*) AS transaction_count
FROM transactions
GROUP BY ledger_id;

-- View for user outstanding amounts
CREATE OR REPLACE VIEW user_outstanding_summary AS
SELECT 
  ts.ledger_id,
  ts.user_id,
  SUM(CASE WHEN t.payer_id = ts.user_id THEN ts.amount ELSE 0 END) AS paid_amount,
  SUM(CASE WHEN t.payer_id != ts.user_id THEN ts.amount ELSE 0 END) AS owed_amount,
  SUM(CASE WHEN t.payer_id != ts.user_id THEN ts.amount ELSE -ts.amount END) AS outstanding
FROM transaction_splits ts
INNER JOIN transactions t ON ts.transaction_id = t.id
GROUP BY ts.ledger_id, ts.user_id;

-- Create indexes on views (if using materialized views in the future)
-- For now, these are regular views that compute on-the-fly but are optimized by the query planner

