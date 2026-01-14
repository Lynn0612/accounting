/**
 * Date formatting utilities
 */

/**
 * Format a date string or Date object to a relative date string
 * Returns "Today", "Yesterday", or formatted date string
 */
export function formatRelativeDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (dateObj.toDateString() === today.toDateString()) {
    return 'Today'
  } else if (dateObj.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  } else {
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

/**
 * Format a date to a short date string (e.g., "Jan 15")
 */
export function formatShortDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Format a date range (e.g., "Jan 1 - Jan 31" or "ALL" for full month)
 */
export function formatDateRange(start: Date, end: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  
  // Check if it's a full month
  if (
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear() &&
    start.getDate() === 1 &&
    end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
  ) {
    return 'ALL'
  }
  
  return `${months[start.getMonth()]} ${start.getDate()} - ${months[end.getMonth()]} ${end.getDate()}`
}

/**
 * Format a date range with year (e.g., "Jan 1, 2024 - Jan 31, 2024")
 */
export function formatDateRangeWithYear(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} - ${endStr}`
}

/**
 * Format a date to month and year (e.g., "January 2024")
 */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Format a date to a simple date string (e.g., "1/15/2024")
 */
export function formatSimpleDate(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month}/${day}/${year}`
}

