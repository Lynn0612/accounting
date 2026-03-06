import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface OutstandingTotalParams {
  ledgerId: string
  ledgerType: 'ledger' | 'account_book'
}

const getOutstandingTotal = async ({ ledgerId, ledgerType }: OutstandingTotalParams): Promise<number> => {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return 0

  const scopeColumn = ledgerType === 'ledger' ? 'ledger_id' : 'book_id'

  const { data: splits, error } = await supabase
    .from('transaction_splits')
    .select(`
      amount,
      user_id,
      transactions!inner (
        payer_id,
        type,
        income_mode,
        expense_payment_source
      )
    `)
    .eq(scopeColumn, ledgerId)

  if (error || !splits) return 0

  let receivable = 0
  let payable = 0

  for (const s of splits as any[]) {
    const tx = s?.transactions
    if (!tx) continue

    // Exclude deposit-funded expenses
    if (tx.type === 'expense' && tx.expense_payment_source === 'deposit') continue

    const txType = tx.type as string | undefined
    const incomeMode = tx.income_mode as string | undefined
    if (txType !== 'expense' && !(txType === 'income' && (incomeMode === 'bonus' || incomeMode === 'refund'))) continue

    const payerId = tx.payer_id as string | undefined
    const splitUserId = s?.user_id as string | undefined
    const amt = Number(s?.amount || 0)
    if (!payerId || !splitUserId || amt <= 0) continue
    if (payerId === splitUserId) continue

    if (txType === 'expense') {
      if (payerId === user.id) {
        // Others owe me
        if (splitUserId !== user.id) receivable += amt
      } else if (splitUserId === user.id) {
        // I owe others
        payable += amt
      }
    } else {
      // bonus/refund income: payer owes split users (reverse direction)
      if (payerId === user.id) {
        // I owe others
        payable += amt
      } else if (splitUserId === user.id) {
        // Others owe me
        receivable += amt
      }
    }
  }

  // Apply settlements (repayments) as offsets without changing the original split logic:
  // - If I receive repayment, others owe me less => subtract from receivable
  // - If I pay repayment, I owe others less => subtract from payable (i.e. add to net)
  let repaymentsReceived = 0
  let repaymentsPaid = 0
  try {
    const [receivedResult, paidResult] = await Promise.all([
      supabase
        .from('settlements')
        .select('amount')
        .eq('ledger_id', ledgerId)
        .eq('receiver_id', user.id),
      supabase
        .from('settlements')
        .select('amount')
        .eq('ledger_id', ledgerId)
        .eq('sender_id', user.id),
    ])

    if (!receivedResult.error) {
      repaymentsReceived = receivedResult.data?.reduce((sum, r: any) => sum + Number(r.amount || 0), 0) || 0
    }
    if (!paidResult.error) {
      repaymentsPaid = paidResult.data?.reduce((sum, r: any) => sum + Number(r.amount || 0), 0) || 0
    }
  } catch {
    // ignore
  }

  return (receivable - payable) - repaymentsReceived + repaymentsPaid
}

export function useOutstandingTotal(ledgerId: string | null, ledgerType?: 'ledger' | 'account_book') {
  return useQuery({
    queryKey: ['outstandingTotal', ledgerId, ledgerType],
    queryFn: () => getOutstandingTotal({ ledgerId: ledgerId!, ledgerType: ledgerType || 'ledger' }),
    enabled: !!ledgerId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
  })
}


