'use client'

import { useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (date: Date) => void
  initialDate?: Date
}

export default function DatePickerModal({ isOpen, onClose, onConfirm, initialDate }: DatePickerModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate || new Date())
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate))

  if (!isOpen) return null

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const handleDayClick = (day: number) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    setSelectedDate(newDate)
  }

  const handleConfirm = () => {
    onConfirm(selectedDate)
    onClose()
  }

  const isSelected = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    return date.toDateString() === selectedDate.toDateString()
  }

  const isToday = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const daysInMonth = getDaysInMonth(currentMonth)
  const firstDay = getFirstDayOfMonth(currentMonth)
  const days = []

  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="h-9"></div>)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const selected = isSelected(day)
    const today = isToday(day)
    days.push(
      <button
        key={day}
        onClick={() => handleDayClick(day)}
        className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
          selected
            ? 'bg-primary text-white shadow-md'
            : today
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-text-main hover:bg-gray-100'
        }`}
      >
        {day}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-[340px] rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-6 pb-4 border-b border-gray-100 bg-white z-10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-text-main">Select Date</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-text-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 pt-2">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-gray-100 rounded-full text-text-secondary"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="font-bold text-text-main">
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-gray-100 rounded-full text-text-secondary"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 mb-2 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                <span key={`day-${day}-${idx}`} className="text-xs font-semibold text-text-secondary/50">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-sm">{days}</div>
          </div>
        </div>

        <div className="p-6 pt-4 bg-white border-t border-gray-100 z-10">
          <button
            onClick={handleConfirm}
            className="w-full bg-primary text-white font-bold text-lg h-14 rounded-2xl shadow-lg shadow-primary/30 hover:bg-primary-light active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

