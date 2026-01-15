'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import DateRangePicker from '@/components/DateRangePicker'
import { createClient } from '@/lib/supabase/client'
import LedgerDropdown from '@/components/LedgerDropdown'
import { useLedger } from '@/contexts/LedgerContext'
import { formatDateRangeWithYear } from '@/utils/date'
import { formatAmountSimple } from '@/utils/formatAmount'
import Loading from '@/components/Loading'
import { useDepositBalance } from '@/hooks/useDepositBalance'
import { useParticipants } from '@/hooks/useParticipants'

// Note: Statistics page uses custom SVG charts instead of recharts
// Recharts is not imported here to reduce bundle size

interface CategoryData {
  id: string
  name: string
  icon: string
  amount: number
  percentage: number
  color: string
}

export default function StatisticsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { activeLedger } = useLedger()
  const { data: participants = [] } = useParticipants(activeLedger?.id || null)
  const isMultiMemberLedger = participants.length > 1

  const { data: depositBalanceData } = useDepositBalance(
    activeLedger?.id || null,
    activeLedger?.type || 'ledger'
  )
  const depositBalance = depositBalanceData?.depositBalance ?? 0
  
  const [statType, setStatType] = useState<'expense' | 'income'>('expense')
  const [showDatePicker, setShowDatePicker] = useState(false)
  // Default to current month
  const [startDate, setStartDate] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [endDate, setEndDate] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  })
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [depositByMember, setDepositByMember] = useState<Array<{ id: string; name: string; avatar?: string; amount: number }>>([])
  const [loadingDepositDetails, setLoadingDepositDetails] = useState(false)

  useEffect(() => {
    loadStatistics()
  }, [statType, startDate, endDate, activeLedger])

  const loadDepositDetails = async () => {
    if (!activeLedger?.id) return
    
    setLoadingDepositDetails(true)
    try {
      const scopeColumn = activeLedger.type === 'account_book' ? 'book_id' : 'ledger_id'
      
      // 查詢所有儲值金收入交易及其分攤
      const { data: depositTransactions, error } = await supabase
        .from('transactions')
        .select(`
          id,
          amount,
          payer_id,
          transaction_splits (
            user_id,
            amount
          )
        `)
        .eq(scopeColumn, activeLedger.id)
        .eq('type', 'income')
        .eq('income_mode', 'deposit')
      
      if (error) {
        console.error('Error loading deposit details:', error)
        setLoadingDepositDetails(false)
        return
      }
      
      // 計算每個成員的儲值金總額
      const memberAmounts: Record<string, number> = {}
      
      depositTransactions?.forEach((tx: any) => {
        // 從 transaction_splits 取得每個成員的分攤金額
        if (tx.transaction_splits && tx.transaction_splits.length > 0) {
          tx.transaction_splits.forEach((split: any) => {
            if (split.user_id) {
              memberAmounts[split.user_id] = (memberAmounts[split.user_id] || 0) + Number(split.amount || 0)
            }
          })
        }
      })
      
      // 將結果與 participants 對應
      const result = participants
        .map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          amount: memberAmounts[p.id] || 0
        }))
        .filter(p => p.amount > 0)
        .sort((a, b) => b.amount - a.amount)
      
      setDepositByMember(result)
    } catch (err) {
      console.error('Error loading deposit details:', err)
    } finally {
      setLoadingDepositDetails(false)
    }
  }

  const handleDepositClick = () => {
    setShowDepositModal(true)
    loadDepositDetails()
  }

  const loadStatistics = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Use activeLedger from global state
      if (!activeLedger || !activeLedger.id) {
        setCategories([])
        setTotalAmount(0)
        setLoading(false)
        return
      }

      const ledgerId = activeLedger.id
      const transactionIdColumn = activeLedger.type === 'account_book' ? 'book_id' : 'ledger_id'
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

      // Optimized: Fetch transactions with categories in one join query
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select(`
          id,
          amount,
          category_id,
          type,
          date,
          categories (
            id,
            name,
            icon,
            type
          )
        `)
        .eq(transactionIdColumn, ledgerId)
        .eq('type', statType === 'expense' ? 'expense' : 'income')
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: false })

      if (txError) {
        console.error('Error loading transactions:', txError)
        setCategories([])
        setTotalAmount(0)
        setLoading(false)
        return
      }

      if (!transactions || transactions.length === 0) {
        setCategories([])
        setTotalAmount(0)
        setLoading(false)
        return
      }

      // Group transactions by category_name and calculate totals
      const categoryGroups = new Map<string, { 
        id: string
        name: string
        icon: string
        amount: number
        transactionCount: number
      }>()
      let grandTotal = 0

      transactions.forEach((tx: any) => {
        const amount = parseFloat(tx.amount) || 0
        grandTotal += amount

        if (tx.category_id && tx.categories) {
          // Use category data from join
          const category = tx.categories
          const categoryName = category.name || 'Unknown'
          const categoryIcon = category.icon || '💰'
          
          // Group by category name
          const existing = categoryGroups.get(categoryName)
          
          if (existing) {
            existing.amount += amount
            existing.transactionCount += 1
          } else {
            categoryGroups.set(categoryName, {
              id: tx.category_id,
              name: categoryName,
              icon: categoryIcon,
              amount: amount,
              transactionCount: 1
            })
          }
        } else if (tx.category_id) {
          // Fallback if category join failed
          const categoryName = 'Unknown'
          const existing = categoryGroups.get(categoryName)
          
          if (existing) {
            existing.amount += amount
            existing.transactionCount += 1
          } else {
            categoryGroups.set(categoryName, {
              id: tx.category_id,
              name: categoryName,
              icon: '💰',
              amount: amount,
              transactionCount: 1
            })
          }
        }
      })

      // Calculate percentage for each category relative to total monthly expense/income
      const colors = ['#4A90E2', '#8ebbf0', '#3a7bc8', '#dbeafe', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd']
      
      const categoryList: CategoryData[] = Array.from(categoryGroups.values())
        .map((data, index) => ({
          id: data.id,
          name: data.name,
          icon: data.icon,
          amount: Math.round(data.amount * 100) / 100, // Round to 2 decimal places
          percentage: grandTotal > 0 ? Math.round((data.amount / grandTotal) * 100 * 100) / 100 : 0, // Round to 2 decimal places
          color: colors[index % colors.length]
        }))
        .sort((a, b) => b.amount - a.amount)

      setCategories(categoryList)
      setTotalAmount(Math.round(grandTotal * 100) / 100)
    } catch (error) {
      console.error('Error loading statistics:', error)
    } finally {
      setLoading(false)
    }
  }

  // Format data for Pie Chart
  const pieChartData = useMemo(() => {
    return categories.map(cat => ({
      name: cat.name,
      value: cat.amount,
      percentage: cat.percentage,
      fill: cat.color
    }))
  }, [categories])

  // Format data for Bar Chart
  const barChartData = useMemo(() => {
    return categories
      .slice(0, 10) // Top 10 categories
      .map(cat => ({
        name: cat.name,
        amount: cat.amount,
        percentage: cat.percentage,
        fill: cat.color
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [categories])

  // Legacy chartData for backward compatibility
  const chartData = useMemo(() => pieChartData, [pieChartData])

  // Date formatting is now handled by utils/date.ts
  const dateRangeString = useMemo(
    () => formatDateRangeWithYear(startDate, endDate),
    [startDate, endDate]
  )

  const handleDateConfirm = (start: Date, end: Date) => {
    setStartDate(start)
    setEndDate(end)
    setShowDatePicker(false)
  }

  const handlePrevPeriod = () => {
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const newEndDate = new Date(startDate)
    newEndDate.setDate(newEndDate.getDate() - 1)
    const newStartDate = new Date(newEndDate)
    newStartDate.setDate(newStartDate.getDate() - daysDiff)
    setStartDate(newStartDate)
    setEndDate(newEndDate)
  }

  const handleNextPeriod = () => {
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const newStartDate = new Date(endDate)
    newStartDate.setDate(newStartDate.getDate() + 1)
    const newEndDate = new Date(newStartDate)
    newEndDate.setDate(newEndDate.getDate() + daysDiff)
    setStartDate(newStartDate)
    setEndDate(newEndDate)
  }

  const calculateDonutSegments = () => {
    if (categories.length === 0) return []
    
    const circumference = 2 * Math.PI * 40
    let cumulativePercentage = 0
    
    return categories.map((cat) => {
      const percentage = cat.percentage / 100
      const dashArray = circumference
      const dashOffset = circumference - (circumference * percentage)
      const rotation = cumulativePercentage * 360
      
      cumulativePercentage += percentage
      
      return {
        ...cat,
        dashArray,
        dashOffset,
        rotation
      }
    })
  }

  const donutSegments = calculateDonutSegments()

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar pb-32 relative w-full max-w-md mx-auto bg-background-light min-h-screen">
      <header className="sticky top-0 z-20 bg-background-light/95 backdrop-blur-sm px-6 pt-12 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="w-10 h-10"></div>
          <h1 className="text-xl font-bold text-text-main tracking-tight">Statistics Analysis</h1>
          <button
            onClick={() => setShowDatePicker(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm text-text-main hover:bg-gray-50 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>calendar_month</span>
          </button>
        </div>
        <div className="flex justify-center">
          <LedgerDropdown className="max-w-xs" />
        </div>
      </header>

      <div className="px-6 mb-6">
        <div className="flex p-1 bg-white rounded-3xl shadow-card relative">
          <label className="flex-1 cursor-pointer">
            <input
              checked={statType === 'expense'}
              onChange={() => setStatType('expense')}
              className="peer sr-only"
              name="stat_type"
              type="radio"
              value="expense"
            />
            <div className="flex items-center justify-center h-10 rounded-3xl text-sm font-semibold transition-all duration-300 peer-checked:bg-primary peer-checked:text-white peer-checked:shadow-md text-text-secondary hover:bg-gray-50">
              Expense
            </div>
          </label>
          <label className="flex-1 cursor-pointer">
            <input
              checked={statType === 'income'}
              onChange={() => setStatType('income')}
              className="peer sr-only"
              name="stat_type"
              type="radio"
              value="income"
            />
            <div className="flex items-center justify-center h-10 rounded-3xl text-sm font-semibold transition-all duration-300 peer-checked:bg-primary peer-checked:text-white peer-checked:shadow-md text-text-secondary hover:bg-gray-50">
              Income
            </div>
          </label>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 mb-6 px-6">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={handlePrevPeriod}
            className="text-text-secondary hover:text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-text-main font-semibold text-lg">{dateRangeString}</span>
          <button
            onClick={handleNextPeriod}
            className="text-text-secondary hover:text-primary transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <Link
          href={`/statistics/compare?type=${statType}`}
          className="bg-white px-4 py-2.5 rounded-full shadow-sm text-sm font-semibold text-text-main flex items-center gap-2 hover:bg-gray-50 active:scale-95 transition-all border border-accent-grey/50"
        >
          <span>Compare</span>
          <span className="material-symbols-outlined text-text-secondary" style={{ fontSize: "18px" }}>compare_arrows</span>
        </Link>
      </div>

      {loading ? (
        <Loading message="Loading..." />
      ) : (
        <>
          <div className="mx-6 mb-8 bg-white rounded-[32px] p-8 shadow-soft flex flex-col items-center relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary-pale/30 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-primary-light/10 rounded-full blur-2xl"></div>
            <div className="relative w-64 h-64 mb-6">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" fill="transparent" r="40" stroke="#f1f5f9" strokeWidth="12"></circle>
                {donutSegments.map((segment, index) => (
                  <circle
                    key={segment.id}
                    className="transition-all duration-1000 ease-out"
                    cx="50"
                    cy="50"
                    fill="transparent"
                    r="40"
                    stroke={segment.color}
                    strokeDasharray={segment.dashArray}
                    strokeDashoffset={segment.dashOffset}
                    strokeLinecap="round"
                    strokeWidth="12"
                    style={{
                      transformOrigin: '50px 50px',
                      transform: `rotate(${segment.rotation}deg)`
                    }}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                <span className="text-text-secondary text-sm font-medium mb-1">
                  Total {statType === 'expense' ? 'Expense' : 'Income'}
                </span>
                <span className="text-3xl font-bold text-text-main tracking-tight">
                  {formatAmountSimple(totalAmount)}
                </span>
              </div>
            </div>
            <div className="w-full grid grid-cols-3 gap-3">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50/50">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }}></div>
                  <div className="flex flex-col">
                    <span className="text-xs text-text-secondary font-medium leading-none mb-1">{cat.name}</span>
                    <span className="text-sm font-bold text-text-main leading-none">{cat.percentage.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>

            {statType === 'income' && isMultiMemberLedger && (
              <div 
                className="w-full mt-5 pt-4 border-t border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-2 rounded-lg transition-colors"
                onClick={handleDepositClick}
              >
                <span className="text-sm font-semibold text-text-secondary flex items-center gap-1">
                  Total Deposit
                  <span className="material-symbols-outlined text-base text-text-muted">chevron_right</span>
                </span>
                <span className="text-sm font-bold text-text-main">{formatAmountSimple(depositBalance)}</span>
              </div>
            )}
          </div>

          <div className="px-8 mb-4 flex justify-between items-end">
            <h3 className="text-lg font-bold text-text-main">{statType === 'expense' ? 'Top Spending' : 'Top Income'}</h3>
            <button
              onClick={() => setShowAllCategories(true)}
              className="text-sm font-medium text-primary hover:text-primary-light transition-colors"
            >
              View All
            </button>
          </div>

          <div className="px-6 flex flex-col gap-4">
            {categories.slice(0, 10).map((cat, index) => {
              const iconConfigs = statType === 'expense' ? [
                { bg: 'bg-primary/10', text: 'text-primary', hoverBg: 'group-hover:bg-primary', icon: 'lunch_dining' },
                { bg: 'bg-blue-100', text: 'text-blue-500', hoverBg: 'group-hover:bg-blue-500', icon: 'house' },
                { bg: 'bg-red-50', text: 'text-red-400', hoverBg: 'group-hover:bg-red-400', icon: 'checkroom' },
                { bg: 'bg-indigo-50', text: 'text-indigo-400', hoverBg: 'group-hover:bg-indigo-400', icon: 'train' },
                { bg: 'bg-slate-100', text: 'text-slate-400', hoverBg: 'group-hover:bg-slate-400', icon: 'shopping_bag' },
                { bg: 'bg-green-50', text: 'text-green-500', hoverBg: 'group-hover:bg-green-500', icon: 'grocery' },
                { bg: 'bg-orange-50', text: 'text-orange-400', hoverBg: 'group-hover:bg-orange-400', icon: 'movie' },
                { bg: 'bg-teal-50', text: 'text-teal-500', hoverBg: 'group-hover:bg-teal-500', icon: 'local_cafe' },
              ] : [
                { bg: 'bg-primary/10', text: 'text-primary', hoverBg: 'group-hover:bg-primary', icon: 'work' },
                { bg: 'bg-blue-100', text: 'text-blue-500', hoverBg: 'group-hover:bg-blue-500', icon: 'celebration' },
                { bg: 'bg-red-50', text: 'text-red-400', hoverBg: 'group-hover:bg-red-400', icon: 'schedule' },
                { bg: 'bg-indigo-50', text: 'text-indigo-400', hoverBg: 'group-hover:bg-indigo-400', icon: 'trending_up' },
                { bg: 'bg-slate-100', text: 'text-slate-400', hoverBg: 'group-hover:bg-slate-400', icon: 'computer' },
                { bg: 'bg-green-50', text: 'text-green-500', hoverBg: 'group-hover:bg-green-500', icon: 'card_giftcard' },
                { bg: 'bg-orange-50', text: 'text-orange-400', hoverBg: 'group-hover:bg-orange-400', icon: 'payments' },
              ]
              
              const config = iconConfigs[index % iconConfigs.length] || iconConfigs[0]

              return (
                <div
                  key={cat.id}
                  className="bg-white p-4 rounded-[24px] shadow-card flex items-center justify-between gap-4 group cursor-pointer hover:shadow-soft transition-all duration-300"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-full ${config.bg} flex items-center justify-center ${config.text} ${config.hoverBg} group-hover:text-white transition-colors`}>
                      {cat.icon && !cat.icon.startsWith('material-symbols') ? (
                        <span className="text-2xl">{cat.icon}</span>
                      ) : (
                        <span className="material-symbols-outlined">{cat.icon || config.icon}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-text-main text-sm">{cat.name}</span>
                        <span className="font-bold text-text-main text-sm">
                          {formatAmountSimple(cat.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {categories.length === 0 && (
              <div className="text-center py-12 text-text-secondary">
                No {statType} data found for this period
              </div>
            )}
            <div className="h-6"></div>
          </div>
        </>
      )}

      {showDatePicker && (
        <DateRangePicker
          isOpen={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onConfirm={handleDateConfirm}
          initialStartDate={startDate}
          initialEndDate={endDate}
        />
      )}

      {showAllCategories && (
        <div className="fixed inset-0 z-50 bg-background-light overflow-y-auto hide-scrollbar">
          <header className="sticky top-0 z-20 bg-background-light/95 backdrop-blur-sm px-6 pt-12 pb-2 flex flex-col gap-4 transition-all">
            <div className="flex items-center justify-between w-full">
              <button
                onClick={() => setShowAllCategories(false)}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm text-text-secondary hover:text-primary hover:bg-gray-50 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>close</span>
              </button>
              <h1 className="text-xl font-bold text-text-main tracking-tight">{statType === 'expense' ? 'All Spending' : 'All Income'}</h1>
              <button
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm text-text-secondary hover:text-primary hover:bg-gray-50 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
                  {sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                </span>
              </button>
            </div>
            <div className="w-full flex justify-center items-center gap-2 pb-2 flex-wrap">
              <button
                onClick={() => setShowDatePicker(true)}
                className="bg-white px-5 py-2.5 rounded-full shadow-sm text-sm font-semibold text-text-main flex items-center gap-2 hover:bg-gray-50 active:scale-95 transition-all border border-accent-grey/50"
              >
                <span>{dateRangeString}</span>
                <span className="material-symbols-outlined text-text-secondary" style={{ fontSize: "18px" }}>calendar_month</span>
              </button>
              <Link
                href={`/statistics/compare?type=${statType}`}
                className="bg-white px-4 py-2.5 rounded-full shadow-sm text-sm font-semibold text-text-main flex items-center gap-2 hover:bg-gray-50 active:scale-95 transition-all border border-accent-grey/50"
              >
                <span>Compare</span>
                <span className="material-symbols-outlined text-text-secondary" style={{ fontSize: "18px" }}>compare_arrows</span>
              </Link>
            </div>
          </header>
          <div className="px-6 pb-12 pt-2 flex flex-col gap-4">
            {[...categories].sort((a, b) => sortOrder === 'desc' ? b.amount - a.amount : a.amount - b.amount).map((cat, index) => {
              const iconConfigs = statType === 'expense' ? [
                { bg: 'bg-primary/10', text: 'text-primary', hoverBg: 'group-hover:bg-primary', icon: 'lunch_dining' },
                { bg: 'bg-blue-100', text: 'text-blue-500', hoverBg: 'group-hover:bg-blue-500', icon: 'house' },
                { bg: 'bg-red-50', text: 'text-red-400', hoverBg: 'group-hover:bg-red-400', icon: 'checkroom' },
                { bg: 'bg-indigo-50', text: 'text-indigo-400', hoverBg: 'group-hover:bg-indigo-400', icon: 'train' },
                { bg: 'bg-slate-100', text: 'text-slate-400', hoverBg: 'group-hover:bg-slate-400', icon: 'shopping_bag' },
                { bg: 'bg-green-50', text: 'text-green-500', hoverBg: 'group-hover:bg-green-500', icon: 'grocery' },
                { bg: 'bg-orange-50', text: 'text-orange-400', hoverBg: 'group-hover:bg-orange-400', icon: 'movie' },
                { bg: 'bg-teal-50', text: 'text-teal-500', hoverBg: 'group-hover:bg-teal-500', icon: 'local_cafe' },
              ] : [
                { bg: 'bg-primary/10', text: 'text-primary', hoverBg: 'group-hover:bg-primary', icon: 'work' },
                { bg: 'bg-blue-100', text: 'text-blue-500', hoverBg: 'group-hover:bg-blue-500', icon: 'celebration' },
                { bg: 'bg-red-50', text: 'text-red-400', hoverBg: 'group-hover:bg-red-400', icon: 'schedule' },
                { bg: 'bg-indigo-50', text: 'text-indigo-400', hoverBg: 'group-hover:bg-indigo-400', icon: 'trending_up' },
                { bg: 'bg-slate-100', text: 'text-slate-400', hoverBg: 'group-hover:bg-slate-400', icon: 'computer' },
                { bg: 'bg-green-50', text: 'text-green-500', hoverBg: 'group-hover:bg-green-500', icon: 'card_giftcard' },
                { bg: 'bg-orange-50', text: 'text-orange-400', hoverBg: 'group-hover:bg-orange-400', icon: 'payments' },
              ]
              
              const config = iconConfigs[index % iconConfigs.length] || iconConfigs[0]

              return (
                <div
                  key={cat.id}
                  className="bg-white p-4 rounded-[24px] shadow-card flex items-center justify-between gap-4 group cursor-pointer hover:shadow-soft transition-all duration-300"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-full ${config.bg} flex items-center justify-center ${config.text} ${config.hoverBg} group-hover:text-white transition-colors`}>
                      {cat.icon && !cat.icon.startsWith('material-symbols') ? (
                        <span className="text-2xl">{cat.icon}</span>
                      ) : (
                        <span className="material-symbols-outlined">{cat.icon || config.icon}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="font-bold text-text-main text-sm">{cat.name}</span>
                        </div>
                        <span className="font-bold text-text-main text-sm">
                          {formatAmountSimple(cat.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {categories.length === 0 && (
              <div className="text-center py-12 text-text-secondary">
                No {statType} data found for this period
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md h-16 bg-white rounded-full shadow-float flex items-center justify-around px-2 z-50">
        <Link
          href="/"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>home</span>
        </Link>
        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
          <span className="material-symbols-outlined filled" style={{ fontVariationSettings: "'FILL' 1", fontSize: "24px" }}>
            pie_chart
          </span>
        </div>
        <div className="w-12"></div>
        <Link
          href="/finance"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>account_balance_wallet</span>
        </Link>
        <Link
          href="/settings"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>settings</span>
        </Link>
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          <Link
            href="/add"
            className="w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>add</span>
          </Link>
        </div>
      </nav>

      {/* Deposit Details Modal */}
      {showDepositModal && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={() => setShowDepositModal(false)}
        >
          <div 
            className="bg-white w-full max-w-md rounded-t-3xl p-6 pb-8 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-text-main">Deposit by Member</h3>
              <button 
                onClick={() => setShowDepositModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <span className="material-symbols-outlined text-text-muted">close</span>
              </button>
            </div>
            
            {loadingDepositDetails ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : depositByMember.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                No deposit records found
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {depositByMember.map((member) => (
                  <div 
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center overflow-hidden">
                        {member.avatar ? (
                          <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-bold">{member.name[0]}</span>
                        )}
                      </div>
                      <span className="font-semibold text-text-main">{member.name}</span>
                    </div>
                    <span className="font-bold text-primary">{formatAmountSimple(member.amount)}</span>
                  </div>
                ))}
                
                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                  <span className="font-semibold text-text-muted">Total Balance</span>
                  <span className="font-bold text-lg text-text-main">{formatAmountSimple(depositBalance)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


