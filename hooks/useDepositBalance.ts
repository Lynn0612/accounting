import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface DepositBalanceParams {
  ledgerId: string
  ledgerType: 'ledger' | 'account_book'
}

interface DepositBalance {
  depositIncome: number
  depositExpense: number
  depositBalance: number
}

const getDepositBalance = async ({ ledgerId, ledgerType }: DepositBalanceParams): Promise<DepositBalance> => {
  const supabase = createClient()
  const scopeColumn = ledgerType === 'ledger' ? 'ledger_id' : 'book_id'

  const [incomeResult, expenseResult] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount')
      .eq(scopeColumn, ledgerId)
      .eq('type', 'income')
      .eq('income_mode', 'deposit'),
    supabase
      .from('transactions')
      .select('amount')
      .eq(scopeColumn, ledgerId)
      .eq('type', 'expense')
      .eq('expense_payment_source', 'deposit'),
  ])

  const depositIncome = incomeResult.data?.reduce((sum, t) => sum + Number((t as any).amount || 0), 0) || 0
  const depositExpense = expenseResult.data?.reduce((sum, t) => sum + Number((t as any).amount || 0), 0) || 0
  const depositBalance = depositIncome - depositExpense

  return { depositIncome, depositExpense, depositBalance }
}

export function useDepositBalance(ledgerId: string | null, ledgerType?: 'ledger' | 'account_book') {
  return useQuery({
    queryKey: ['depositBalance', ledgerId, ledgerType],
    queryFn: () => getDepositBalance({ ledgerId: ledgerId!, ledgerType: ledgerType || 'ledger' }),
    enabled: !!ledgerId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
  })
}


