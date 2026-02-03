'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import { X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DateRangePicker from '@/components/DateRangePicker'
import { useLedger } from '@/contexts/LedgerContext'
import { useTransactions } from '@/hooks/useTransactions'
import { useSettlements } from '@/hooks/useSettlements'
import { useUser } from '@/hooks/useUser'
import { useParticipants } from '@/hooks/useParticipants'
import TransactionCard from '@/components/TransactionCard'
import TransactionCardSkeleton from '@/components/TransactionCardSkeleton'
import { formatRelativeDate, formatDateRange, formatShortDate } from '@/utils/date'
import { formatTransactionAmount } from '@/utils/formatAmount'

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
  const pathname = usePathname()
  const { activeLedger } = useLedger()
  const { data: user } = useUser()
  const { data: participants = [] } = useParticipants(activeLedger?.id || null)
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
  const { data: settlementsData = [] } = useSettlements({
    ledgerId: activeLedger?.id || null,
    ledgerType: activeLedger?.type as 'ledger' | 'account_book' | undefined,
    startDate: startDateStr,
    endDate: endDateTimeStr,
    enabled: !!activeLedger?.id,
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
          if (tx.expense_payment_source === 'deposit' || tx.income_mode === 'deposit') {
            payerText = 'Deposit'
          } else {
          payerText = 'Shared'
          if (tx.payer_id === user.id) {
            payerText = 'You paid'
          } else if (payer) {
            payerText = `${payer.full_name || 'Unknown'} paid`
          }
          }
        } else if (tx.income_mode === 'deposit') {
          payerText = 'Deposit'
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
      const payerText = isIncoming ? `${senderName} paid` : `${receiverName} paid`

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

  // Removed month boundaries - no longer grouping by month
  // All transactions will be displayed directly sorted by date

  const groupedTransactions = useMemo(() => {
    // Sort filtered transactions by date first (newest date first), then by createdAt (newest time first)
    const sortedTransactions = [...filteredTransactions].sort((a, b) => {
      // First, compare by date (transaction date) - only compare date part, ignore time
      const dateA = new Date(a.date)
      dateA.setHours(0, 0, 0, 0)
      const dateB = new Date(b.date)
      dateB.setHours(0, 0, 0, 0)
      const dateATime = dateA.getTime()
      const dateBTime = dateB.getTime()
      const dateDiff = dateBTime - dateATime // Newest date first
      
      // If dates are the same (same day), compare by createdAt (time)
      if (dateDiff === 0) {
        const timeA = (a as any).createdAt?.getTime() || 0
        const timeB = (b as any).createdAt?.getTime() || 0
        return timeB - timeA // Newest time first
      }
      
      return dateDiff
    })

    // Don't group by month - just return all transactions sorted by date
    // User requested to remove "Earlier" grouping and show all data directly
    return { all: sortedTransactions }
  }, [filteredTransactions])

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
    <div className="w-full max-w-md bg-background-light min-h-screen flex flex-col relative overflow-x-hidden mx-auto pb-32" style={{ minHeight: '100dvh' }}>
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
        {groupedTransactions.all.length > 0 ? (
          <div className="flex flex-col gap-3">
            {groupedTransactions.all.map((tx) => (
              <TransactionCard
                key={tx.id}
                id={tx.id}
                title={tx.name}
                date={formatShortDate(tx.date)}
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
        ) : !loading && filteredTransactions.length === 0 ? (
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
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md h-16 bg-white rounded-full shadow-float flex items-center justify-around px-2 z-50">
        <Link 
          href="/" 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${pathname === '/' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
        >
          <span className={`material-symbols-outlined ${pathname === '/' ? 'filled' : ''}`} style={pathname === '/' ? { fontVariationSettings: "'FILL' 1" } : {}}>home</span>
        </Link>
        <Link 
          href="/statistics" 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${pathname === '/statistics' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
        >
          <span className={`material-symbols-outlined ${pathname === '/statistics' ? 'filled' : ''}`} style={pathname === '/statistics' ? { fontVariationSettings: "'FILL' 1" } : {}}>pie_chart</span>
        </Link>
        <div className="w-12"></div>
        <Link 
          href="/finance" 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${pathname === '/finance' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
        >
          <span className={`material-symbols-outlined ${pathname === '/finance' ? 'filled' : ''}`} style={pathname === '/finance' ? { fontVariationSettings: "'FILL' 1" } : {}}>account_balance_wallet</span>
        </Link>
        <Link 
          href="/settings" 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${pathname === '/settings' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
        >
          <span className={`material-symbols-outlined ${pathname === '/settings' ? 'filled' : ''}`} style={pathname === '/settings' ? { fontVariationSettings: "'FILL' 1" } : {}}>settings</span>
        </Link>
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          <Link href="/add" className="w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
            <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>add</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
