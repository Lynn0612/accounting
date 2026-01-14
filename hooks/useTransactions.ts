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
      query = query.lte('transactions.date', endDate)
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

    // 處理 Payer 資訊
    if (includePayer && formattedData.length > 0) {
      const payerIds = Array.from(new Set(formattedData.map((tx: any) => tx.payer_id)))
        .filter((id): id is string => id != null)

      if (payerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', payerIds)

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))
        return formattedData.map((tx: any) => ({
          ...tx,
          payer: profileMap.get(tx.payer_id) || null,
        }))
      }
    }

    return formattedData.map((tx: any) => ({ ...tx, payer: null }))
  }

  // 原有的全帳本查詢邏輯
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
      created_at${includeCategory ? ', categories (id, name, icon)' : ''}
    `)
    .eq(scopeColumn, ledgerId)

  if (type) {
    query = query.eq('type', type)
  }

  if (startDate) {
    query = query.gte('date', startDate)
  }

  if (endDate) {
    query = query.lte('date', endDate)
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

  // If includePayer is true, fetch payer profiles
  if (includePayer && data && data.length > 0) {
    const payerIds = data
      .map((tx: any) => tx.payer_id)
      .filter((id: string | null): id is string => id != null)

    if (payerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', payerIds)

      const profileMap = new Map(
        (profiles || []).map((p: any) => [p.id, p])
      )

      return data.map((tx: any) => ({
        ...tx,
        payer: profileMap.get(tx.payer_id) || null,
      }))
    }
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

