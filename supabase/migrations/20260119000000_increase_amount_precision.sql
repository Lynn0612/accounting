-- Increase amount precision for transactions and transaction_splits
-- Current: NUMERIC(12,2) - max value: 9,999,999,999.99 (約 100 億)
-- New: NUMERIC(18,2) - max value: 999,999,999,999,999,999.99 (約 1000 萬億)
-- This should be sufficient for most accounting needs

-- ============================================
-- 1. 修改 transactions.amount 欄位精度
-- ============================================
DO $$
BEGIN
  -- 檢查當前欄位類型
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'transactions' 
    AND column_name = 'amount'
    AND data_type = 'numeric'
    AND numeric_precision < 18
  ) THEN
    -- 修改為 NUMERIC(18,2)
    ALTER TABLE transactions 
    ALTER COLUMN amount TYPE NUMERIC(18,2);
    
    RAISE NOTICE 'Updated transactions.amount to NUMERIC(18,2)';
  ELSE
    RAISE NOTICE 'transactions.amount already has sufficient precision or does not exist';
  END IF;
END $$;

-- ============================================
-- 2. 修改 transaction_splits.amount 欄位精度
-- ============================================
DO $$
BEGIN
  -- 檢查當前欄位類型
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'transaction_splits' 
    AND column_name = 'amount'
    AND data_type = 'numeric'
    AND numeric_precision < 18
  ) THEN
    -- 修改為 NUMERIC(18,2)
    ALTER TABLE transaction_splits 
    ALTER COLUMN amount TYPE NUMERIC(18,2);
    
    RAISE NOTICE 'Updated transaction_splits.amount to NUMERIC(18,2)';
  ELSE
    RAISE NOTICE 'transaction_splits.amount already has sufficient precision or does not exist';
  END IF;
END $$;

-- ============================================
-- 3. 修改 settlements.amount 欄位精度（如果存在）
-- ============================================
DO $$
BEGIN
  -- 檢查當前欄位類型
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'settlements' 
    AND column_name = 'amount'
    AND data_type = 'numeric'
    AND numeric_precision < 18
  ) THEN
    -- 修改為 NUMERIC(18,2)
    ALTER TABLE settlements 
    ALTER COLUMN amount TYPE NUMERIC(18,2);
    
    RAISE NOTICE 'Updated settlements.amount to NUMERIC(18,2)';
  ELSE
    RAISE NOTICE 'settlements.amount already has sufficient precision or does not exist';
  END IF;
END $$;

-- ============================================
-- 4. 驗證修改結果
-- ============================================
DO $$
DECLARE
  trans_precision INTEGER;
  splits_precision INTEGER;
  settlements_precision INTEGER;
BEGIN
  -- 檢查 transactions.amount
  SELECT numeric_precision INTO trans_precision
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'transactions' 
  AND column_name = 'amount';
  
  -- 檢查 transaction_splits.amount
  SELECT numeric_precision INTO splits_precision
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'transaction_splits' 
  AND column_name = 'amount';
  
  -- 檢查 settlements.amount
  SELECT numeric_precision INTO settlements_precision
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'settlements' 
  AND column_name = 'amount';
  
  -- 輸出結果
  IF trans_precision >= 18 THEN
    RAISE NOTICE '✓ transactions.amount precision: %', trans_precision;
  ELSE
    RAISE WARNING '✗ transactions.amount precision: % (expected >= 18)', trans_precision;
  END IF;
  
  IF splits_precision >= 18 THEN
    RAISE NOTICE '✓ transaction_splits.amount precision: %', splits_precision;
  ELSE
    RAISE WARNING '✗ transaction_splits.amount precision: % (expected >= 18)', splits_precision;
  END IF;
  
  IF settlements_precision IS NOT NULL THEN
    IF settlements_precision >= 18 THEN
      RAISE NOTICE '✓ settlements.amount precision: %', settlements_precision;
    ELSE
      RAISE WARNING '✗ settlements.amount precision: % (expected >= 18)', settlements_precision;
    END IF;
  END IF;
END $$;

-- 重置 PostgREST schema cache
NOTIFY pgrst, 'reload schema';

