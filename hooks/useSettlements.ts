import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface Settlement {
  id: string
  sender_id: string
  receiver_id: string
  amount: number
  created_at: string
  date?: string
  note?: string
}

interface UseSettlementsParams {
  ledgerId: string | null
  ledgerType?: 'ledger' | 'account_book'
  limit?: number
  startDate?: string
  endDate?: string
  enabled?: boolean
}

const getSettlements = async ({ 
  ledgerId, 
  ledgerType = 'ledger', 
  limit,
  startDate,
  endDate
}: Omit<UseSettlementsParams, 'enabled'>): Promise<Settlement[]> => {
  if (!ledgerId) {
    return []
  }

  const supabase = createClient()
  
  // settlements table uses ledger_id for both ledgers and account_books
  let query = supabase
    .from('settlements')
    .select('id, sender_id, receiver_id, amount, created_at, date, note')
    .eq('ledger_id', ledgerId)

  // Filter by date field if available, otherwise use created_at
  // settlements table has both 'date' and 'created_at' fields
  if (startDate) {
    // Try to filter by 'date' field first (transaction date), fallback to 'created_at'
    query = query.or(`date.gte.${startDate},and(date.is.null,created_at.gte.${startDate})`)
  }

  if (endDate) {
    // Try to filter by 'date' field first (transaction date), fallback to 'created_at'
    query = query.or(`date.lte.${endDate},and(date.is.null,created_at.lte.${endDate})`)
  }

  query = query.order('created_at', { ascending: false })

  if (limit) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching settlements:', error)
    // Fallback: try without optional fields
    const fallback = await supabase
      .from('settlements')
      .select('id, sender_id, receiver_id, amount')
      .eq('ledger_id', ledgerId)
    if (fallback.error) return []
    return (fallback.data || []) as Settlement[]
  }

  return (data || []) as Settlement[]
}

export function useSettlements({ 
  ledgerId, 
  ledgerType, 
  limit, 
  startDate,
  endDate,
  enabled = true 
}: UseSettlementsParams) {
  return useQuery({
    queryKey: ['settlements', ledgerId, ledgerType, limit, startDate, endDate],
    queryFn: () => getSettlements({ ledgerId, ledgerType, limit, startDate, endDate }),
    enabled: enabled && !!ledgerId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })
}

