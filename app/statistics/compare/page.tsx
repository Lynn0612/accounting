'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import DateRangePicker from '@/components/DateRangePicker'
import { createClient } from '@/lib/supabase/client'
import { useLedger } from '@/contexts/LedgerContext'
import { formatDateRangeWithYear, formatShortDate } from '@/utils/date'
import { formatAmountSimple } from '@/utils/formatAmount'
import Loading from '@/components/Loading'

interface CategoryData {
  id: string
  name: string
  icon: string
  amount: number
}

interface CategoryComparison {
  id: string
  name: string
  icon: string
  amountA: number
  amountB: number
  difference: number
  percentage: number
  color: string
}

export default function ComparePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { activeLedger } = useLedger()
  
  const getInitialStatType = (): 'expense' | 'income' => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const type = params.get('type')
      if (type === 'expense' || type === 'income') {
        return type
      }
    }
    const type = searchParams.get('type')
    if (type === 'expense' || type === 'income') {
      return type
    }
    return 'expense'
  }
  
  const [statType, setStatType] = useState<'expense' | 'income'>(getInitialStatType())
  const [showDatePicker, setShowDatePicker] = useState<'period1' | 'period2' | null>(null)
  
  const [period1Start, setPeriod1Start] = useState<Date>(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const [period1End, setPeriod1End] = useState<Date>(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
  })
  
  const [period2Start, setPeriod2Start] = useState<Date>(() => {
    const date = new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const [period2End, setPeriod2End] = useState<Date>(() => {
    const date = new Date()
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
  })
  
  const [categoriesA, setCategoriesA] = useState<CategoryData[]>([])
  const [categoriesB, setCategoriesB] = useState<CategoryData[]>([])
  const [comparisons, setComparisons] = useState<CategoryComparison[]>([])
  const [totalA, setTotalA] = useState(0)
  const [totalB, setTotalB] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const type = searchParams.get('type') as 'expense' | 'income'
    if (type && (type === 'expense' || type === 'income')) {
      setStatType(type)
    }
  }, [searchParams])

  useEffect(() => {
    loadData()
  }, [statType, activeLedger, period1Start, period1End, period2Start, period2End])

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Use activeLedger from global state
      if (!activeLedger || !activeLedger.id) {
        setCategoriesA([])
        setCategoriesB([])
        setComparisons([])
        setTotalA(0)
        setTotalB(0)
        setLoading(false)
        return
      }

      const ledgerId = activeLedger.id
      const transactionIdColumn = activeLedger.type === 'account_book' ? 'book_id' : 'ledger_id'
      const categoryIdColumn = activeLedger.type === 'account_book' ? 'book_id' : 'ledger_id'

      // Format dates using local timezone to avoid UTC conversion issues
      const formatDateStr = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const period1StartStr = formatDateStr(period1Start)
      const period1EndStr = formatDateStr(period1End)
      const period2StartStr = formatDateStr(period2Start)
      const period2EndStr = formatDateStr(period2End)

      // Fetch transactions directly (not splits) for both periods
      const [transactionsA, transactionsB, categoriesData] = await Promise.all([
        supabase
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
          .gte('date', period1StartStr)
          .lte('date', period1EndStr)
          .order('date', { ascending: false }),
        supabase
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
          .gte('date', period2StartStr)
          .lte('date', period2EndStr)
          .order('date', { ascending: false }),
        supabase
          .from('categories')
          .select('id, name, icon, type')
          .eq(categoryIdColumn, ledgerId)
          .eq('type', statType === 'expense' ? 'Expense' : 'Income')
      ])

      const categoryMap = new Map<string, { name: string; icon: string }>()
      if (categoriesData.data) {
        categoriesData.data.forEach(cat => {
          categoryMap.set(cat.id, { name: cat.name, icon: cat.icon })
        })
      }

      const processTransactions = (transactions: any[]) => {
        const categoryTotals = new Map<string, number>()
        let total = 0

        transactions.forEach((tx: any) => {
          if (!tx || !tx.category_id) return
          
          const amount = parseFloat(tx.amount) || 0
          total += amount
          
          const current = categoryTotals.get(tx.category_id) || 0
          categoryTotals.set(tx.category_id, current + amount)
        })

        return { categoryTotals, total }
      }

      const periodA = processTransactions(transactionsA.data || [])
      const periodB = processTransactions(transactionsB.data || [])

      const colors = ['#4A90E2', '#8ebbf0', '#3a7bc8', '#dbeafe', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd']
      
      const allCategoryIds = new Set([
        ...Array.from(periodA.categoryTotals.keys()),
        ...Array.from(periodB.categoryTotals.keys())
      ])

      const categoriesAList: CategoryData[] = Array.from(allCategoryIds)
        .map((categoryId) => {
          const categoryInfo = categoryMap.get(categoryId) || { name: 'Unknown', icon: '💰' }
          const amount = periodA.categoryTotals.get(categoryId) || 0
          return {
            id: categoryId,
            name: categoryInfo.name,
            icon: categoryInfo.icon,
            amount
          }
        })
        .filter(cat => cat.amount > 0)
        .sort((a, b) => b.amount - a.amount)

      const categoriesBList: CategoryData[] = Array.from(allCategoryIds)
        .map((categoryId) => {
          const categoryInfo = categoryMap.get(categoryId) || { name: 'Unknown', icon: '💰' }
          const amount = periodB.categoryTotals.get(categoryId) || 0
          return {
            id: categoryId,
            name: categoryInfo.name,
            icon: categoryInfo.icon,
            amount
          }
        })
        .filter(cat => cat.amount > 0)
        .sort((a, b) => b.amount - a.amount)

      const comparisonsList: CategoryComparison[] = Array.from(allCategoryIds)
        .map((categoryId, index) => {
          const categoryInfo = categoryMap.get(categoryId) || { name: 'Unknown', icon: '💰' }
          const amountA = periodA.categoryTotals.get(categoryId) || 0
          const amountB = periodB.categoryTotals.get(categoryId) || 0
          const difference = amountB - amountA
          
          // Calculate percentage with proper bounds
          let percentage = 0
          if (amountA > 0) {
            // Normal case: calculate percentage change from Period 1
            percentage = (difference / amountA) * 100
            // Cap percentage at ±100% for reasonable display
            percentage = Math.max(-100, Math.min(100, percentage))
          } else if (amountB > 0) {
            // Period 1 had 0, Period 2 has value: this is a new category
            // Show as 100% increase (from 0 to amountB)
            percentage = 100
          } else {
            // Both periods have 0: no change
            percentage = 0
          }
          
          return {
            id: categoryId,
            name: categoryInfo.name,
            icon: categoryInfo.icon,
            amountA,
            amountB,
            difference,
            percentage: Math.round(percentage * 100) / 100,
            color: colors[index % colors.length]
          }
        })
        .filter(comp => comp.amountA > 0 || comp.amountB > 0)

      setCategoriesA(categoriesAList)
      setCategoriesB(categoriesBList)
      setComparisons(comparisonsList)
      setTotalA(periodA.total)
      setTotalB(periodB.total)
    } catch (error) {
      console.error('Error loading compare data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Date formatting is now handled by utils/date.ts
  const formatPeriod = (start: Date, end?: Date) => {
    if (end) {
      return formatDateRangeWithYear(start, end)
    }
    const startMonth = formatShortDate(start).split(' ')[0]
    const startYear = start.getFullYear()
    return `${startMonth} ${startYear}`
  }

  const handleDateConfirm = (start: Date, end: Date) => {
    if (showDatePicker === 'period1') {
      setPeriod1Start(start)
      setPeriod1End(end)
    } else if (showDatePicker === 'period2') {
      setPeriod2Start(start)
      setPeriod2End(end)
    }
    setShowDatePicker(null)
  }

  const totalDifference = totalB - totalA
  const totalPercentage = totalA > 0 ? (totalDifference / totalA) * 100 : (totalB > 0 ? 100 : 0)

  // Top Changes: Show categories with biggest changes
  // For expense: show biggest savings (decreases only) - sorted by absolute value (biggest savings first)
  // For income: prioritize increases, but show decreases if no increases
  const topChanges = (() => {
      if (statType === 'expense') {
      // For expense: ONLY show decreases (savings) - biggest savings first
      // Sort by absolute difference descending: biggest savings (most negative) first
      const decreases = comparisons.filter(c => c.difference < 0)
      if (decreases.length > 0) {
        // Show biggest savings (most negative difference) - sorted by absolute value descending
        return decreases
    .sort((a, b) => {
            // a.difference and b.difference are both negative
            // We want the most negative (biggest absolute value) first
            // Math.abs(-1200) = 1200, Math.abs(-500) = 500
            // We want -1200 before -500, so we need descending order by absolute value
            return Math.abs(b.difference) - Math.abs(a.difference) // Biggest savings first
    })
    .slice(0, 5)
      } else {
        // If no decreases, don't show Top Changes for expense
        return []
      }
    } else {
      // For income: prefer increases, but show decreases if no increases
      const increases = comparisons.filter(c => c.difference > 0)
      if (increases.length > 0) {
        // Show biggest increases
        return increases
          .sort((a, b) => b.difference - a.difference) // Biggest increase first
          .slice(0, 5)
      } else {
        // If no increases, show biggest decreases
        return comparisons
          .filter(c => c.difference < 0)
          .sort((a, b) => a.difference - b.difference) // Most negative first
          .slice(0, 5)
      }
    }
  })()

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar relative w-full max-w-md mx-auto bg-background-light">
      <header className="sticky top-0 z-20 bg-background-light/95 backdrop-blur-sm px-6 pt-12 pb-2 flex flex-col gap-4 transition-all">
        <div className="flex items-center justify-between w-full">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm text-text-secondary hover:text-primary hover:bg-gray-50 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>arrow_back</span>
          </button>
          <h1 className="text-xl font-bold text-text-main tracking-tight">{statType === 'expense' ? 'Compare Spending' : 'Compare Income'}</h1>
          <div className="w-10 h-10"></div>
        </div>
        <div className="flex flex-col gap-6 mt-2">
          <div className="flex justify-between items-center gap-2">
            <button
              onClick={() => setShowDatePicker('period1')}
              className="bg-white flex-1 py-3 px-3 rounded-[20px] shadow-sm text-sm font-semibold text-text-main flex flex-col items-center justify-center gap-1 hover:bg-gray-50 active:scale-95 transition-all border border-accent-grey/50"
            >
              <span className="text-xs text-text-secondary font-medium">Period 1</span>
              <span className="flex items-center gap-1">
                {formatPeriod(period1Start, period1End)}
                <span className="material-symbols-outlined text-text-secondary" style={{ fontSize: "16px" }}>expand_more</span>
              </span>
            </button>
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>compare_arrows</span>
            </div>
            <button
              onClick={() => setShowDatePicker('period2')}
              className="bg-primary-pale flex-1 py-3 px-3 rounded-[20px] shadow-sm text-sm font-semibold text-text-main flex flex-col items-center justify-center gap-1 hover:bg-blue-200 active:scale-95 transition-all border border-blue-200/50"
            >
              <span className="text-xs text-text-secondary font-medium">Period 2</span>
              <span className="flex items-center gap-1">
                {formatPeriod(period2Start, period2End)}
                <span className="material-symbols-outlined text-text-secondary" style={{ fontSize: "16px" }}>expand_more</span>
              </span>
            </button>
          </div>
          <div className="bg-white p-6 rounded-[24px] shadow-card flex flex-col items-center justify-center gap-2 text-center">
            <span className="text-text-secondary text-sm font-medium">Total Difference</span>
            <div className="flex items-end gap-2">
              <span className={`text-3xl font-bold ${totalPercentage >= 0 ? 'text-trend-up' : 'text-trend-down'}`}>
                {totalPercentage >= 0 ? '+' : ''}{totalPercentage.toFixed(0)}%
              </span>
              <span className={`text-lg font-bold mb-1 ${totalDifference >= 0 ? 'text-trend-up' : 'text-trend-down'}`}>
                {formatAmountSimple(totalDifference)}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-1">
              {statType === 'expense' ? 'Spending' : 'Income'} {totalDifference >= 0 ? 'increased' : 'decreased'} compared to Period 1
            </p>
          </div>
        </div>
      </header>

      {loading ? (
        <Loading message="Loading..." />
      ) : (
        <div className="px-4 pb-12 pt-2 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-3">
              {categoriesA.slice(0, 3).map((cat, index) => {
                const iconConfigs = statType === 'expense' ? [
                  { bg: 'bg-primary/10', text: 'text-primary', icon: 'lunch_dining' },
                  { bg: 'bg-blue-100', text: 'text-blue-500', icon: 'house' },
                  { bg: 'bg-red-50', text: 'text-red-400', icon: 'checkroom' },
                ] : [
                  { bg: 'bg-primary/10', text: 'text-primary', icon: 'work' },
                  { bg: 'bg-blue-100', text: 'text-blue-500', icon: 'celebration' },
                  { bg: 'bg-red-50', text: 'text-red-400', icon: 'schedule' },
                ]
                const config = iconConfigs[index % iconConfigs.length]
                
                return (
                  <div key={cat.id} className="bg-white p-3 rounded-[20px] shadow-sm flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center ${config.text} shrink-0`}>
                        {cat.icon && !cat.icon.startsWith('material-symbols') ? (
                          <span className="text-lg">{cat.icon}</span>
                        ) : (
                        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>{cat.icon || config.icon}</span>
                        )}
                      </div>
                      <span className="font-bold text-text-main text-xs truncate">{cat.name}</span>
                    </div>
                    <span className="font-bold text-text-main text-sm text-right">
                      {formatAmountSimple(cat.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col gap-3">
              {categoriesB.slice(0, 3).map((cat, index) => {
                const comparison = comparisons.find(c => c.id === cat.id)
                const iconConfigs = statType === 'expense' ? [
                  { bg: 'bg-primary/10', text: 'text-primary', icon: 'lunch_dining' },
                  { bg: 'bg-blue-100', text: 'text-blue-500', icon: 'house' },
                  { bg: 'bg-red-50', text: 'text-red-400', icon: 'checkroom' },
                ] : [
                  { bg: 'bg-primary/10', text: 'text-primary', icon: 'work' },
                  { bg: 'bg-blue-100', text: 'text-blue-500', icon: 'celebration' },
                  { bg: 'bg-red-50', text: 'text-red-400', icon: 'schedule' },
                ]
                const config = iconConfigs[index % iconConfigs.length]
                
                return (
                  <div key={cat.id} className="bg-primary-pale p-3 rounded-[20px] shadow-sm flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center ${config.text} shrink-0`}>
                        {cat.icon && !cat.icon.startsWith('material-symbols') ? (
                          <span className="text-lg">{cat.icon}</span>
                        ) : (
                        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>{cat.icon || config.icon}</span>
                        )}
                      </div>
                      <span className="font-bold text-text-main text-xs truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {comparison && comparison.amountA > 0 && (
                        <span className={`text-xs font-bold ${
                          comparison.percentage > 0 ? 'text-trend-up' : comparison.percentage === 0 ? 'text-text-secondary' : 'text-trend-down'
                        }`}>
                          {comparison.percentage > 0 ? '+' : ''}{comparison.percentage.toFixed(0)}%
                        </span>
                      )}
                      {comparison && comparison.amountA === 0 && comparison.amountB > 0 && (
                        <span className="text-xs text-text-secondary">New</span>
                      )}
                      {comparison && comparison.amountA === 0 && comparison.amountB === 0 && (
                        <span className="text-xs text-text-secondary">0%</span>
                      )}
                      <span className="font-bold text-text-main text-sm">
                        {formatAmountSimple(cat.amount)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {topChanges.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-bold text-text-main px-2 mb-3">
                {statType === 'expense' 
                  ? 'Top Savings'
                  : (topChanges[0]?.difference > 0 ? 'Top Increases' : 'Top Decreases')
                }
              </h3>
              <div className="flex flex-col gap-3">
                {topChanges.map((change) => {
                  // For expense: all are decreases (savings) - always green
                  // For income: increases are red, decreases are green
                  const isDecrease = change.difference < 0
                  let bgColor, textColor, diffColor
                  
                  if (statType === 'expense') {
                    // Expense: all are decreases (savings) - always green
                    bgColor = 'bg-[#10b981]/10'
                    textColor = 'text-trend-down'
                    diffColor = 'text-trend-down'
                  } else {
                    // Income: increases = red, decreases = green
                    bgColor = isDecrease 
                    ? 'bg-[#10b981]/10'
                    : 'bg-[#ef4444]/10'
                    textColor = isDecrease
                    ? 'text-trend-down'
                    : 'text-trend-up'
                    diffColor = isDecrease
                    ? 'text-trend-down'
                    : 'text-trend-up'
                  }
                  
                  return (
                    <div key={change.id} className="bg-white p-4 rounded-[24px] shadow-card flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center ${textColor}`}>
                          {change.icon && !change.icon.startsWith('material-symbols') ? (
                            <span className="text-xl">{change.icon}</span>
                          ) : (
                            <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>{change.icon || '💰'}</span>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-text-main text-sm">{change.name}</span>
                          <span className="text-xs text-text-secondary">
                            {formatPeriod(period1Start, period1End)} vs {formatPeriod(period2Start, period2End)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`font-bold text-sm ${diffColor}`}>
                          {statType === 'expense' && isDecrease 
                            ? formatAmountSimple(change.difference) // Already has negative sign
                            : (change.difference >= 0 ? '+' : '') + formatAmountSimple(change.difference)
                          }
                        </span>
                        <span className={`text-xs ${diffColor}`}>
                          {statType === 'expense' && isDecrease
                            ? change.percentage.toFixed(0) + '%' // Already negative, no need for + sign
                            : (change.percentage >= 0 ? '+' : '') + change.percentage.toFixed(0) + '%'
                          }
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showDatePicker && (
        <DateRangePicker
          isOpen={showDatePicker !== null}
          onClose={() => setShowDatePicker(null)}
          onConfirm={handleDateConfirm}
          initialStartDate={showDatePicker === 'period1' ? period1Start : period2Start}
          initialEndDate={showDatePicker === 'period1' ? period1End : period2End}
        />
      )}
    </div>
  )
}

