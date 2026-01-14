'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import { X } from 'lucide-react'
import Link from 'next/link'
import DateRangePicker from '@/components/DateRangePicker'
import { useLedger } from '@/contexts/LedgerContext'
import { useTransactions } from '@/hooks/useTransactions'
import { useUser } from '@/hooks/useUser'
import { useParticipants } from '@/hooks/useParticipants'
import TransactionCard from '@/components/TransactionCard'
import TransactionCardSkeleton from '@/components/TransactionCardSkeleton'
import { formatRelativeDate, formatDateRange } from '@/utils/date'
import { formatTransactionAmount } from '@/utils/formatAmount'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface Transaction {
  id: string
  name: string
  date: Date
  category: string
  amount: number
  payer: string
  icon: string
  iconBg: string
  type: 'income' | 'expense'
}

export default function TransactionsPage() {
  const { activeLedger } = useLedger()
  const { data: user } = useUser()
  const { data: participants = [] } = useParticipants(activeLedger?.id || null)
  const supabase = useMemo(() => createClient(), [])
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  )
  const [endDate, setEndDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  )

  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  const { data: transactionsData = [], isLoading: loading } = useTransactions({
    ledgerId: activeLedger?.id || '',
    ledgerType: activeLedger?.type || 'ledger',
    startDate: startDateStr,
    endDate: endDateStr,
    includeCategory: true,
    includePayer: true,
  })

  const endDateTimeStr = useMemo(() => `${endDateStr}T23:59:59.999Z`, [endDateStr])
  const { data: settlementsData = [] } = useQuery({
    queryKey: ['settlements', activeLedger?.id, startDateStr, endDateStr],
    enabled: !!activeLedger?.id,
    queryFn: async () => {
      const ledgerId = activeLedger!.id
      const { data, error } = await supabase
        .from('settlements')
        .select('id, sender_id, receiver_id, amount, created_at, date, note')
        .eq('ledger_id', ledgerId)
        .gte('created_at', startDateStr)
        .lte('created_at', endDateTimeStr)
        .order('created_at', { ascending: false })

      if (error) {
        const fallback = await supabase
          .from('settlements')
          .select('id, sender_id, receiver_id, amount')
          .eq('ledger_id', ledgerId)
        if (fallback.error) return []
        return fallback.data || []
      }

      return data || []
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })

  // Memoize icon background mapping
  const iconBgMap = useMemo(() => ({
      '🍱': 'bg-orange-50 dark:bg-orange-900/20',
      '🚌': 'bg-blue-50 dark:bg-blue-900/20',
      '🛒': 'bg-green-50 dark:bg-green-900/20',
      '🍔': 'bg-orange-50 dark:bg-orange-900/20',
      '🚗': 'bg-blue-50 dark:bg-blue-900/20',
      '🏠': 'bg-purple-50 dark:bg-purple-900/20',
      '💰': 'bg-yellow-50 dark:bg-yellow-900/20',
  }), []);

  const getIconBg = useCallback((icon: string) => {
    return iconBgMap[icon as keyof typeof iconBgMap] || 'bg-gray-50 dark:bg-gray-900/20';
  }, [iconBgMap]);

  // Format transactions data
  const transactions: Transaction[] = useMemo(() => {
    if (!transactionsData || !user) return []

    const txRows: Transaction[] = transactionsData.map((tx: any) => {
        const category = tx.categories
      const categoryIcon = category?.icon || (tx.type === 'income' ? '💰' : '💸')
      const payer = tx.payer
        
        // For income transactions, don't show payer text (keep it blank)
        let payerText = ''
        if (tx.type !== 'income') {
          payerText = 'Shared'
          if (tx.payer_id === user.id) {
            payerText = 'You paid'
          } else if (payer) {
            payerText = `${payer.full_name || 'Unknown'} paid`
          }
        }

      const categoryName = category?.name || 'Other'
      const displayTitle = tx.description?.trim() || categoryName

      return {
        id: tx.id,
        name: displayTitle,
        date: new Date(tx.date),
        createdAt: new Date(tx.created_at), // 新增 createdAt 用於排序
        category: categoryName,
        amount: Number(tx.amount),
        payer: payerText,
        icon: categoryIcon,
        iconBg: getIconBg(categoryIcon),
        type: tx.type || 'expense',
      }
      })

    const participantById = new Map((participants || []).map((p: any) => [p.id, p]))
    const settlementRows: Transaction[] = (settlementsData || []).map((s: any) => {
      const sender = participantById.get(s.sender_id)
      const receiver = participantById.get(s.receiver_id)
      const senderName = sender?.name || '有人'
      const receiverName = receiver?.name || '有人'
      const transactionDate = s.date ? new Date(s.date) : s.created_at ? new Date(s.created_at) : new Date()

      const isIncoming = s.receiver_id === user.id
      const defaultTitle = 'Repayment' // 如果沒備註，預設顯示類別名稱
      const payerText = isIncoming ? `${senderName} paid` : ''

      return {
        id: `settlement-${s.id}`,
        name: s.note || defaultTitle,
        date: transactionDate,
        createdAt: new Date(s.created_at), // 新增 createdAt 用於排序
        category: 'Repayment',
        amount: Number(s.amount) || 0,
        payer: payerText,
        icon: '🤝',
        iconBg: 'bg-indigo-50 dark:bg-indigo-900/20',
        type: isIncoming ? 'income' : 'expense',
      }
    })

    return [...txRows, ...settlementRows]
  }, [transactionsData, settlementsData, participants, user, getIconBg])

  // Memoize formatted date range string
  const dateRangeString = useMemo(
    () => formatDateRange(startDate, endDate),
    [startDate, endDate]
  )

  // Optimized: Pre-calculate date boundaries
  const dateBoundaries = useMemo(() => {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }, [startDate, endDate])

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const txDate = new Date(tx.date)
      txDate.setHours(0, 0, 0, 0)
      return txDate >= dateBoundaries.start && txDate <= dateBoundaries.end
    })
  }, [transactions, dateBoundaries])

  // Optimized: Pre-calculate month boundaries and use single pass grouping
  const monthBoundaries = useMemo(() => {
    const now = new Date()
    return {
      currentMonthStart: new Date(now.getFullYear(), now.getMonth(), 1),
      lastMonthStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      lastMonthEnd: new Date(now.getFullYear(), now.getMonth(), 0),
    }
  }, [])

  const groupedTransactions = useMemo(() => {
    // Sort filtered transactions by createdAt (newest entry first)
    const sortedTransactions = [...filteredTransactions].sort((a, b) => {
      const timeA = (a as any).createdAt?.getTime() || 0
      const timeB = (b as any).createdAt?.getTime() || 0
      return timeB - timeA
    })

    // Single pass grouping for better performance
    const thisMonth: Transaction[] = []
    const lastMonth: Transaction[] = []
    const other: Transaction[] = []

    sortedTransactions.forEach((tx) => {
      const txDate = tx.date
      if (txDate >= monthBoundaries.currentMonthStart) {
        thisMonth.push(tx)
      } else if (txDate >= monthBoundaries.lastMonthStart && txDate <= monthBoundaries.lastMonthEnd) {
        lastMonth.push(tx)
      } else {
        other.push(tx)
      }
    })

    return { thisMonth, lastMonth, other }
  }, [filteredTransactions, monthBoundaries])

  const handleDateConfirm = useCallback((start: Date, end: Date) => {
    // Enforce at least 1-day range (cannot select same day)
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())

    if (endDay.getTime() <= startDay.getTime()) {
      const nextDay = new Date(startDay)
      nextDay.setDate(nextDay.getDate() + 1)
      setStartDate(startDay)
      setEndDate(nextDay)
      return
    }

    setStartDate(startDay)
    setEndDate(endDay)
  }, [])

  return (
    <div className="w-full max-w-md bg-background-light min-h-screen flex flex-col relative overflow-hidden mx-auto">
      <header className="pt-8 pb-2 px-6 flex flex-col z-10 sticky top-0 bg-background-light/95 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm hover:shadow-md transition-all text-text-muted hover:text-text-main"
          >
            <X className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-text-main">All Transactions</h1>
          <div className="w-10"></div>
        </div>
        <div className="flex items-center justify-between bg-white p-2 rounded-full shadow-sm">
          <button
            type="button"
            onClick={() => setIsDatePickerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-background-light rounded-full text-sm font-semibold text-text-main hover:bg-gray-100 transition-colors w-full justify-center"
          >
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>
              calendar_today
            </span>
            <span className="whitespace-nowrap">{dateRangeString}</span>
            <span className="material-symbols-outlined text-text-muted" style={{ fontSize: '18px' }}>
              expand_more
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-8 px-6 pt-2">
        {groupedTransactions.thisMonth.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-text-muted mb-3 px-1">This Month</h3>
            <div className="flex flex-col gap-3">
            {groupedTransactions.thisMonth.map((tx) => (
              <TransactionCard
                key={tx.id}
                id={tx.id}
                title={tx.name}
                date={formatRelativeDate(tx.date)}
                categoryName={tx.category}
                amount={tx.amount}
                amountPrefix={tx.type === 'income' ? '+' : '-'}
                amountColor={tx.type === 'income' ? 'text-green-600' : 'text-[#1e293b]'}
                payerText={tx.payer}
                categoryIcon={tx.icon}
                iconBg={tx.iconBg}
              />
              ))}
            </div>
          </div>
        )}

        {groupedTransactions.lastMonth.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-text-muted mb-3 px-1">Last Month</h3>
            <div className="flex flex-col gap-3">
              {groupedTransactions.lastMonth.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  id={tx.id}
                  title={tx.name}
                  date={formatRelativeDate(tx.date)}
                  categoryName={tx.category}
                  amount={tx.amount}
                  amountPrefix={tx.type === 'income' ? '+' : '-'}
                  amountColor={tx.type === 'income' ? 'text-green-600' : 'text-[#1e293b]'}
                  payerText={tx.payer}
                  categoryIcon={tx.icon}
                  iconBg={tx.iconBg}
                />
              ))}
            </div>
          </div>
        )}

        {groupedTransactions.other.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-text-muted mb-3 px-1">Earlier</h3>
            <div className="flex flex-col gap-3">
              {groupedTransactions.other.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  id={tx.id}
                  title={tx.name}
                  date={formatRelativeDate(tx.date)}
                  categoryName={tx.category}
                  amount={tx.amount}
                  amountPrefix={tx.type === 'income' ? '+' : '-'}
                  amountColor={tx.type === 'income' ? 'text-green-600' : 'text-[#1e293b]'}
                  payerText={tx.payer}
                  categoryIcon={tx.icon}
                  iconBg={tx.iconBg}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && filteredTransactions.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <p className="text-text-muted">No transactions</p>
          </div>
        )}
      </main>

      <DateRangePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onConfirm={handleDateConfirm}
        initialStartDate={startDate}
        initialEndDate={endDate}
      />
    </div>
  )
}
