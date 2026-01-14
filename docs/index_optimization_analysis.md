# 數據庫索引優化分析

## 已添加的索引

### transactions 表
1. `idx_transactions_ledger_date` - `(ledger_id, date DESC)`
2. `idx_transactions_ledger_type` - `(ledger_id, type)`
3. `idx_transactions_category` - `(category_id)`

### transaction_splits 表
1. `idx_splits_transaction` - `(transaction_id)`
2. `idx_splits_user_ledger` - `(user_id, ledger_id)`

### categories 表
1. `idx_categories_ledger_type` - `(ledger_id, type)`

## 查詢與索引匹配分析

### ✅ 已優化的查詢

1. **useTransactions.ts** - 基本查詢
   - `.eq('ledger_id', ledgerId)` + `.order('date', { ascending: false })`
   - ✅ 使用 `idx_transactions_ledger_date`

2. **useTransactions.ts** - 按類型過濾
   - `.eq('ledger_id', ledgerId)` + `.eq('type', type)`
   - ✅ 使用 `idx_transactions_ledger_type`

3. **useLedgerBalance.ts**
   - `.eq('ledger_id', ledgerId)` + `.eq('type', 'income')`
   - `.eq('ledger_id', ledgerId)` + `.eq('type', 'expense')`
   - ✅ 使用 `idx_transactions_ledger_type`

4. **useCategories.ts**
   - `.eq('ledger_id', ledgerId)` + `.or('type.eq.Expense,type.eq.expense')`
   - ✅ 使用 `idx_categories_ledger_type`

5. **app/page.tsx** - transaction_splits
   - `.eq('ledger_id', activeLedgerId)` + `.eq('user_id', userId)`
   - ✅ 使用 `idx_splits_user_ledger`

6. **app/edit/[id]/page.tsx** - transaction_splits
   - `.eq('transaction_id', transactionId)`
   - ✅ 使用 `idx_splits_transaction`

### ⚠️ 可進一步優化的查詢

1. **app/statistics/page.tsx** - 統計查詢
   - 查詢模式：`.eq('ledger_id', ledgerId)` + `.eq('type', type)` + `.gte('date', startDate)` + `.lte('date', endDate)` + `.order('date', { ascending: false })`
   - 建議：考慮添加複合索引 `(ledger_id, type, date DESC)` 以優化此類查詢

2. **useTransactions.ts** - 同時使用 type 和 date
   - 當同時提供 `type` 和日期範圍時，可能需要複合索引
   - 當前：可能使用 `idx_transactions_ledger_type` 然後在內存中過濾日期
   - 建議：如果此類查詢頻繁，考慮添加 `(ledger_id, type, date DESC)`

## 結論

**現有代碼無需更改**，因為：
1. PostgreSQL 查詢優化器會自動選擇最合適的索引
2. 現有查詢已經能夠利用已添加的索引
3. 索引會自動提升查詢性能，無需修改代碼

**可選優化**（如果統計頁面查詢較慢）：
- 添加複合索引 `idx_transactions_ledger_type_date` 用於同時按 ledger_id, type, date 查詢的場景

