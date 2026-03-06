import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface TransactionQueryParams {
  ledgerId: string
  ledgerType?: 'ledger' | 'account_book'
  startDate?: string
  endDate?: string
  type?: 'income' | 'expense'
  limit?: number
  includeCategory?: boolean
  includePayer?: boolean
  userId?: string // 新增：用於過濾特定使用者的分帳資料
}

const getTransactions = async (params: TransactionQueryParams) => {
  const supabase = createClient()
  const {
    ledgerId,
    ledgerType = 'ledger',
    startDate,
    endDate,
    type,
    limit,
    includeCategory = false,
    includePayer = false,
    userId,
  } = params

  const scopeColumn = ledgerType === 'account_book' ? 'book_id' : 'ledger_id'

  // 如果有 userId，我們從 transaction_splits 抓取屬於該使用者的資料
  if (userId) {
    let query = supabase
      .from('transaction_splits')
      .select(`
        amount,
        transactions!inner (
          id,
          description,
          date,
          type,
          payer_id,
          category_id,
          expense_payment_source,
          income_mode,
          is_public_expense,
          public_amount,
          created_at${includeCategory ? ', categories (id, name, icon)' : ''}
        )
      `)
      .eq(scopeColumn, ledgerId)
      .eq('user_id', userId)

    if (type) {
      query = query.eq('transactions.type', type)
    }
    if (startDate) {
      query = query.gte('transactions.date', startDate)
    }
    if (endDate) {
      // Use 'lt' (less than) with next day to include all records on the endDate
      // This ensures that if endDate is '2026-01-31', we get all records from 2026-01-31
      const endDateObj = new Date(endDate)
      endDateObj.setDate(endDateObj.getDate() + 1)
      const nextDayStr = endDateObj.toISOString().split('T')[0]
      query = query.lt('transactions.date', nextDayStr)
    }

    query = query.order('transactions(created_at)', { ascending: false })
    query = query.order('transactions(date)', { ascending: false })

    if (limit) {
      query = query.limit(limit)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching user transaction splits:', error)
      return []
    }

    // 格式化回傳結構，讓它看起來像 transaction
    const formattedData = (data || []).map((s: any) => ({
      ...s.transactions,
      amount: s.amount, // 使用分帳後的金額
    }))

    // 處理 Payer 資訊 - 使用 JOIN 一次查詢獲取
    if (includePayer) {
      // 使用 JOIN 查詢，一次獲取 transactions 和 payer profiles
      let queryWithPayer = supabase
        .from('transaction_splits')
        .select(`
          amount,
            transactions!inner (
            id,
            description,
            date,
            type,
            payer_id,
            category_id,
            expense_payment_source,
            income_mode,
            is_public_expense,
            public_amount,
            created_at,
            payer:profiles!transactions_payer_id_fkey (id, full_name, avatar_url)${includeCategory ? ', categories (id, name, icon)' : ''}
          )
        `)
        .eq(scopeColumn, ledgerId)
        .eq('user_id', userId)

      if (type) {
        queryWithPayer = queryWithPayer.eq('transactions.type', type)
      }
      if (startDate) {
        queryWithPayer = queryWithPayer.gte('transactions.date', startDate)
      }
      if (endDate) {
        // Use 'lt' (less than) with next day to include all records on the endDate
        const endDateObj = new Date(endDate)
        endDateObj.setDate(endDateObj.getDate() + 1)
        const nextDayStr = endDateObj.toISOString().split('T')[0]
        queryWithPayer = queryWithPayer.lt('transactions.date', nextDayStr)
      }

      queryWithPayer = queryWithPayer.order('transactions(created_at)', { ascending: false })
      queryWithPayer = queryWithPayer.order('transactions(date)', { ascending: false })

      if (limit) {
        queryWithPayer = queryWithPayer.limit(limit)
      }

      const { data: dataWithPayer, error: errorWithPayer } = await queryWithPayer

      if (errorWithPayer) {
        console.error('Error fetching user transaction splits with payer:', errorWithPayer)
        return formattedData.map((tx: any) => ({ ...tx, payer: null }))
      }

      // 格式化回傳結構，payer 資訊已經通過 JOIN 獲取
      return (dataWithPayer || []).map((s: any) => ({
        ...s.transactions,
        amount: s.amount,
        payer: s.transactions.payer || null,
        }))
    }

    return formattedData.map((tx: any) => ({ ...tx, payer: null }))
  }

  // 原有的全帳本查詢邏輯
  // 如果 includePayer 為 true，使用 JOIN 一次查詢獲取 payer 資訊
  let query = supabase
    .from('transactions')
      .select(`
      id,
      amount,
      description,
      date,
      type,
      payer_id,
      category_id,
      expense_payment_source,
      income_mode,
      is_public_expense,
      public_amount,
      created_at${includeCategory ? ', categories (id, name, icon)' : ''}${includePayer ? ', payer:profiles!transactions_payer_id_fkey (id, full_name, avatar_url)' : ''}
    `)
    .eq(scopeColumn, ledgerId)

  if (type) {
    query = query.eq('type', type)
  }

  if (startDate) {
    query = query.gte('date', startDate)
  }

  if (endDate) {
    // Use 'lt' (less than) with next day to include all records on the endDate
    const endDateObj = new Date(endDate)
    endDateObj.setDate(endDateObj.getDate() + 1)
    const nextDayStr = endDateObj.toISOString().split('T')[0]
    query = query.lt('date', nextDayStr)
  }

  query = query.order('created_at', { ascending: false })
  query = query.order('date', { ascending: false })

  if (limit) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching transactions:', error)
    return []
  }

  // If includePayer is true, payer info is already included via JOIN
  if (includePayer && data && data.length > 0) {
      return data.map((tx: any) => ({
        ...tx,
      payer: tx.payer || null,
      }))
  }

  return (data || []).map((tx: any) => ({
    ...tx,
    payer: null,
  }))
}

export function useTransactions(
  params: TransactionQueryParams,
  options?: {
    initialData?: any[]
    enabled?: boolean
  }
) {
  return useQuery({
    queryKey: [
      'transactions',
      params.ledgerId,
      params.ledgerType || 'ledger',
      params.startDate,
      params.endDate,
      params.type,
      params.limit,
      params.includeCategory,
      params.includePayer,
      params.userId,
    ],
    queryFn: () => getTransactions(params),
    enabled: options?.enabled !== undefined ? options.enabled : !!params.ledgerId,
    initialData: options?.initialData,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3, // Retry up to 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })
}

