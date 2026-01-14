'use client'

import { useState } from 'react'
import { X, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'

interface DateRangePickerProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (startDate: Date, endDate: Date) => void
  initialStartDate?: Date
  initialEndDate?: Date
}

export default function DateRangePicker({
  isOpen,
  onClose,
  onConfirm,
  initialStartDate,
  initialEndDate,
}: DateRangePickerProps) {
  const [startDate, setStartDate] = useState<Date | null>(
    initialStartDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  )
  const [endDate, setEndDate] = useState<Date | null>(
    initialEndDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  )
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [nextMonth, setNextMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
  )

  if (!isOpen) return null

  const formatDate = (date: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[date.getMonth()]} ${date.getDate()}`
  }

  const formatMonthYear = (date: Date) => {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]
    return `${months[date.getMonth()]} ${date.getFullYear()}`
  }

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const isDateInRange = (date: Date) => {
    if (!startDate || !endDate) return false
    return date >= startDate && date <= endDate
  }

  const isDateSelected = (date: Date) => {
    if (!startDate && !endDate) return false
    if (startDate && date.getTime() === startDate.getTime()) return true
    if (endDate && date.getTime() === endDate.getTime()) return true
    return false
  }

  const handleDateClick = (date: Date) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(date)
      setEndDate(null)
    } else if (startDate && !endDate) {
      // Must click a different date to complete the range
      if (date.getTime() === startDate.getTime()) {
        return
      }
      if (date < startDate) {
        setEndDate(startDate)
        setStartDate(date)
      } else {
        setEndDate(date)
      }
    }
  }

  const handlePrevMonth = () => {
    const newDate = new Date(currentMonth)
    newDate.setMonth(newDate.getMonth() - 1)
    setCurrentMonth(newDate)
    const newNextDate = new Date(nextMonth)
    newNextDate.setMonth(newNextDate.getMonth() - 1)
    setNextMonth(newNextDate)
  }

  const handleNextMonth = () => {
    const newDate = new Date(currentMonth)
    newDate.setMonth(newDate.getMonth() + 1)
    setCurrentMonth(newDate)
    const newNextDate = new Date(nextMonth)
    newNextDate.setMonth(newNextDate.getMonth() + 1)
    setNextMonth(newNextDate)
  }

  const handleConfirm = () => {
    const startDay = startDate
      ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
      : null
    const endDay = endDate
      ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
      : null

    const isValidRange = !!(startDay && endDay && endDay.getTime() > startDay.getTime())

    if (startDay && endDay && isValidRange) {
      onConfirm(startDay, endDay)
      onClose()
    }
  }

  const startDay = startDate
    ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    : null
  const endDay = endDate
    ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    : null
  const isValidRange = !!(startDay && endDay && endDay.getTime() > startDay.getTime())

  const renderCalendar = (month: Date) => {
    const daysInMonth = getDaysInMonth(month)
    const firstDay = getFirstDayOfMonth(month)
    const days = []

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-9"></div>)
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day)
      const inRange = isDateInRange(date)
      const isStart = startDate && date.getTime() === startDate.getTime()
      const isEnd = endDate && date.getTime() === endDate.getTime()

      // Calculate position in grid
      const positionInGrid = firstDay + day - 1
      const col = positionInGrid % 7
      const isFirstInRow = col === 0
      const isLastInRow = col === 6

      // Check if previous/next day is in range
      const prevDate = day > 1 ? new Date(month.getFullYear(), month.getMonth(), day - 1) : null
      const nextDate = day < daysInMonth ? new Date(month.getFullYear(), month.getMonth(), day + 1) : null
      const prevInRange = prevDate ? isDateInRange(prevDate) : false
      const nextInRange = nextDate ? isDateInRange(nextDate) : false

      let bgClass = ''
      let textClass = 'text-slate-700'
      let roundedClass = ''
      let rangeBgClass = ''
      let content = <span className="relative z-10">{day}</span>

      if (isStart) {
        // Start date: blue circle with white text
        content = (
          <div className="relative w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white font-bold shadow-md z-10">
            {day}
          </div>
        )
        // Add range background extending to the right
        if (nextInRange && !isLastInRow) {
          rangeBgClass = 'absolute inset-y-0 right-0 left-1/2 bg-primary-pale/50 rounded-l-full'
        }
      } else if (isEnd) {
        // End date: blue circle with white text
        content = (
          <div className="relative w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white font-bold shadow-md z-10">
            {day}
          </div>
        )
        // Add range background extending to the left
        if (prevInRange && !isFirstInRow) {
          rangeBgClass = 'absolute inset-y-0 left-0 right-1/2 bg-primary-pale/50 rounded-r-full'
        }
      } else if (inRange) {
        // In range: light blue background with dark blue text
        bgClass = 'bg-primary-pale/50'
        textClass = 'text-primary-dark font-medium'
        content = <span className="relative z-10">{day}</span>
        
        // Add rounded corners based on position
        if (isFirstInRow || !prevInRange) {
          roundedClass = 'rounded-l-lg'
        }
        if (isLastInRow || !nextInRange) {
          roundedClass = roundedClass ? 'rounded-lg' : 'rounded-r-lg'
        }
      } else {
        // Not in range: hover effect
        bgClass = 'hover:bg-gray-50 rounded-full'
      }

      days.push(
        <div
          key={day}
          className={`h-9 relative flex items-center justify-center cursor-pointer ${bgClass} ${textClass} ${roundedClass}`}
          onClick={() => handleDateClick(date)}
        >
          {rangeBgClass && <div className={rangeBgClass}></div>}
          {content}
        </div>
      )
    }

    return days
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>
      <div className="relative bg-white w-full max-w-[340px] rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        <div className="p-6 pb-4 border-b border-gray-100 bg-white z-10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-700">Select Period</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-slate-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-[#F0F4F8] rounded-2xl p-3 border-2 border-primary-500/20 relative">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                Start
              </span>
              <div className="font-bold text-slate-700 text-lg">
                {startDate ? formatDate(startDate) : 'Select'}
              </div>
              <div className="absolute top-1/2 -right-1.5 w-3 h-3 bg-white border-l border-b border-primary-500/20 transform -translate-y-1/2 rotate-45"></div>
            </div>
            <ArrowRight className="text-slate-500" />
            <div className="flex-1 bg-white rounded-2xl p-3 border border-gray-200 hover:border-primary-500/50 transition-colors">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                End
              </span>
              <div className="font-bold text-slate-700 text-lg">
                {endDate ? formatDate(endDate) : 'Select'}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 pt-2 hide-scrollbar">
          {/* First Month */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-gray-100 rounded-full text-slate-500"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="font-bold text-slate-700">{formatMonthYear(currentMonth)}</span>
              <div className="w-8"></div>
            </div>
            <div className="grid grid-cols-7 mb-2 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                <span key={`current-${day}-${idx}`} className="text-xs font-semibold text-slate-500/50">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
              {renderCalendar(currentMonth)}
            </div>
          </div>

          {/* Second Month */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-8"></div>
              <span className="font-bold text-slate-700">{formatMonthYear(nextMonth)}</span>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-gray-100 rounded-full text-slate-500"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 mb-2 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                <span key={`${nextMonth.getTime()}-${day}-${idx}`} className="text-xs font-semibold text-slate-500/50">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
              {renderCalendar(nextMonth)}
            </div>
          </div>
        </div>

        <div className="p-6 pt-4 bg-white border-t border-gray-100 z-10">
          <button
            onClick={handleConfirm}
            disabled={!isValidRange}
            className="w-full bg-primary-500 text-white font-bold text-lg h-14 rounded-2xl shadow-lg shadow-primary-500/30 hover:bg-primary-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
