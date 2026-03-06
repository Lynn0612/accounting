import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface LedgerBalance {
  income: number
  expense: number
  balance: number
}

interface LedgerBalanceParams {
  ledgerId: string
  ledgerType: 'ledger' | 'account_book'
}

const getLedgerBalance = async ({ ledgerId, ledgerType }: LedgerBalanceParams): Promise<LedgerBalance> => {
  const supabase = createClient()

  // Get current user to calculate personal balance including settlements
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { income: 0, expense: 0, balance: 0 }
  }

  // Determine which column to use based on ledger type
  // transactions table uses ledger_id for ledgers and book_id for account_books
  const transactionIdColumn = ledgerType === 'ledger' ? 'ledger_id' : 'book_id'
  // settlements table now uses ledger_id for both ledgers and account_books (after SQL migration)
  const settlementIdColumn = 'ledger_id'

  // Personal income: only include personal income (exclude common fund deposit / bonus-refund)
  // Note: be resilient if some columns/migrations are not yet applied on the DB.
  // Personal expense: compute from splits, and for payer-without-self-split compute (tx.amount - sum(others))
  // Fetch income and expense transactions in parallel
  const fetchIncome = async () => {
    let result = await supabase
    .from('transactions')
    .select('amount')
    .eq(transactionIdColumn, ledgerId)
    .eq('type', 'income')
    .eq('payer_id', user.id)
    .or('income_mode.eq.personal,income_mode.is.null')

    if (result.error) {
      // Fallback if income_mode column doesn't exist
      result = await supabase
      .from('transactions')
      .select('amount')
      .eq(transactionIdColumn, ledgerId)
      .eq('type', 'income')
      .eq('payer_id', user.id)
  }
    return result
  }

  const fetchExpenseTxs = async () => {
    let result = await supabase
    .from('transactions')
    .select('id, amount, payer_id')
    .eq(transactionIdColumn, ledgerId)
    .eq('type', 'expense')
    .neq('expense_payment_source', 'deposit')

    if (result.error) {
      // Fallback if expense_payment_source column doesn't exist
      result = await supabase
      .from('transactions')
      .select('id, amount, payer_id')
      .eq(transactionIdColumn, ledgerId)
      .eq('type', 'expense')
  }
    return result
  }

  const [incomeResult, expenseTxResult] = await Promise.all([
    fetchIncome(),
    fetchExpenseTxs()
  ])

  const income = incomeResult.data?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0

  const expenseTxs = (expenseTxResult.data || []) as Array<{ id: string; amount: any; payer_id: string }>
  if (!expenseTxs.length) {
    // No expense transactions, but still need to compute settlements
    const expense = 0
    const [settlementsReceivedResult, settlementsPaidResult] = await fetchSettlements()
    
    let repaymentsReceived = 0
    let repaymentsPaid = 0
      if (!settlementsReceivedResult.error) {
        repaymentsReceived = settlementsReceivedResult.data?.reduce((sum, s) => sum + Number(s.amount || 0), 0) || 0
      }
      if (!settlementsPaidResult.error) {
        repaymentsPaid = settlementsPaidResult.data?.reduce((sum, s) => sum + Number(s.amount || 0), 0) || 0
    }
    const balance = (income - expense) + (repaymentsReceived - repaymentsPaid)
    return { income, expense, balance }
  }

  const expenseTxById = new Map<string, { amount: number; payer_id: string }>()
  const payerTxIds: string[] = []
  const allExpenseTxIds: string[] = []
  for (const t of expenseTxs) {
    const id = (t as any).id as string
    const amount = Number((t as any).amount || 0)
    const payer_id = (t as any).payer_id as string
    expenseTxById.set(id, { amount, payer_id })
    allExpenseTxIds.push(id)
    if (payer_id === user.id) payerTxIds.push(id)
  }

  const splitsScopeColumn = ledgerType === 'ledger' ? 'ledger_id' : 'book_id'

  // Fetch self splits and settlements in parallel (they don't depend on each other)
  const fetchSelfSplits = async () => {
    let result = await supabase
    .from('transaction_splits')
    .select(`
      transaction_id,
      amount,
      transactions!inner (
        type,
        expense_payment_source
      )
    `)
    .eq(splitsScopeColumn, ledgerId)
    .eq('user_id', user.id)
    .eq('transactions.type', 'expense')
    .neq('transactions.expense_payment_source', 'deposit')

    if (result.error) {
      // Fallback if expense_payment_source column doesn't exist
      result = await supabase
      .from('transaction_splits')
      .select('transaction_id, amount')
      .eq(splitsScopeColumn, ledgerId)
      .eq('user_id', user.id)
  }
    return result
  }

  const fetchSettlements = async () => {
    try {
      return await Promise.all([
        supabase
          .from('settlements')
          .select('amount')
          .eq(settlementIdColumn, ledgerId)
          .eq('receiver_id', user.id),
        supabase
          .from('settlements')
          .select('amount')
          .eq(settlementIdColumn, ledgerId)
          .eq('sender_id', user.id),
      ])
    } catch {
      // If settlements table doesn't exist, return empty results
      return [{ data: [], error: null }, { data: [], error: null }]
    }
  }

  const [splitsSelfResult, settlementsResults] = await Promise.all([
    fetchSelfSplits(),
    fetchSettlements()
  ])

  const selfSplitAmountByTx = new Map<string, number>()
  let expenseFromSelfSplits = 0
  for (const s of splitsSelfResult.data || []) {
    const txId = (s as any).transaction_id as string
    const amt = Number((s as any).amount || 0)
    if (!txId) continue
    // Only count splits that belong to expense transactions we are considering
    if (!expenseTxById.has(txId)) continue
    selfSplitAmountByTx.set(txId, (selfSplitAmountByTx.get(txId) || 0) + amt)
    expenseFromSelfSplits += amt
  }

  let expenseFromPayerOwnShare = 0
  if (payerTxIds.length > 0) {
    const splitsOthersResult = await supabase
      .from('transaction_splits')
      .select('transaction_id, amount, user_id')
      .in('transaction_id', payerTxIds)
      .neq('user_id', user.id)

    const othersSumByTx = new Map<string, number>()
    for (const s of splitsOthersResult.data || []) {
      const txId = (s as any).transaction_id as string
      const amt = Number((s as any).amount || 0)
      if (!txId) continue
      othersSumByTx.set(txId, (othersSumByTx.get(txId) || 0) + amt)
    }

    for (const txId of payerTxIds) {
      // If we already have a self split row, it already represents user's share.
      if (selfSplitAmountByTx.has(txId)) continue
      const tx = expenseTxById.get(txId)
      if (!tx) continue
      const others = othersSumByTx.get(txId) || 0
      const ownShare = tx.amount - others
      if (ownShare > 0) expenseFromPayerOwnShare += ownShare
    }
  }

  const expense = expenseFromSelfSplits + expenseFromPayerOwnShare
  
  // Get settlements result from the parallel fetch
  // Settlements affect personal balance but are NOT real income/expense
  const [settlementsReceivedResult, settlementsPaidResult] = settlementsResults
  let repaymentsReceived = 0
  let repaymentsPaid = 0
    
    if (!settlementsReceivedResult.error) {
      repaymentsReceived = settlementsReceivedResult.data?.reduce((sum, s) => sum + Number(s.amount || 0), 0) || 0
    }
    if (!settlementsPaidResult.error) {
      repaymentsPaid = settlementsPaidResult.data?.reduce((sum, s) => sum + Number(s.amount || 0), 0) || 0
  }
  
  // Balance = (Income - Expense) + (Repayments Received - Repayments Paid)
  // This gives the personal balance perspective
  const balance = (income - expense) + (repaymentsReceived - repaymentsPaid)

  return { income, expense, balance }
}

export function useLedgerBalance(ledgerId: string | null, ledgerType?: 'ledger' | 'account_book') {
  return useQuery({
    queryKey: ['ledgerBalance', ledgerId, ledgerType],
    queryFn: () => getLedgerBalance({ ledgerId: ledgerId!, ledgerType: ledgerType || 'ledger' }),
    enabled: !!ledgerId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3, // Retry up to 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })
}

