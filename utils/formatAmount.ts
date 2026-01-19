/**
 * Amount formatting utilities
 */

/**
 * Format a number as currency with default options
 */
export function formatAmount(
  amount: number | string,
  options?: {
    prefix?: string
    suffix?: string
    minimumFractionDigits?: number
    maximumFractionDigits?: number
    showSign?: boolean
  }
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  const {
    prefix = '$',
    suffix = '',
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
    showSign = false,
  } = options || {}

  const formatted = numAmount.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  })

  const sign = showSign && numAmount > 0 ? '+' : ''
  return `${sign}${prefix}${formatted}${suffix}`
}

/**
 * Format amount with 2 decimal places (for detailed views)
 */
export function formatAmountDetailed(amount: number | string): string {
  return formatAmount(amount, {
    prefix: '$',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format amount without decimals (for summary views)
 */
export function formatAmountSimple(amount: number | string): string {
  return formatAmount(amount, {
    prefix: '$',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/**
 * Format amount with sign prefix (+ or -)
 */
export function formatAmountWithSign(
  amount: number | string,
  isIncome: boolean = false
): string {
  return formatAmount(amount, {
    prefix: isIncome ? '+' : '-',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    showSign: false, // We handle sign manually
  })
}

/**
 * Format amount for display in transaction cards
 */
export function formatTransactionAmount(
  amount: number | string,
  type: 'income' | 'expense'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  const prefix = type === 'income' ? '+' : '-'
  return formatAmount(numAmount, {
    prefix,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/**
 * Format amount string for display with thousand separators
 * Handles expressions with operators (+, -, ×, ÷) and formats each number part
 * Note: This is for display only. The original amount string is preserved for calculations.
 */
export function formatAmountString(amountStr: string): string {
  // Handle empty or invalid input
  if (!amountStr || amountStr.trim() === '' || amountStr === '0') return '0'
  
  // Remove any existing commas (in case of re-formatting)
  const cleanStr = amountStr.replace(/,/g, '').trim()
  
  if (!cleanStr || cleanStr === '0') return '0'
  
  // Check if it contains operators
  if (/[+\-×÷]/.test(cleanStr)) {
    // Split by operators and format each numeric part
    const parts = cleanStr.split(/([+\-×÷])/)
    return parts.map((part) => {
      // Keep operators as-is
      if (['+', '-', '×', '÷'].includes(part)) {
        return part
      }
      // Format numeric part
      const trimmed = part.trim()
      if (!trimmed) return part
      
      const num = parseFloat(trimmed)
      if (isNaN(num) || !isFinite(num)) return part
      
      // Preserve decimal places if present in original
      const hasDecimal = trimmed.includes('.')
      const decimalPlaces = hasDecimal ? trimmed.split('.')[1]?.length || 0 : 0
      
      return num.toLocaleString('en-US', {
        minimumFractionDigits: hasDecimal ? Math.min(decimalPlaces, 2) : 0,
        maximumFractionDigits: 2,
      })
    }).join('')
  }
  
  // Simple number formatting
  const num = parseFloat(cleanStr)
  if (isNaN(num) || !isFinite(num)) return amountStr
  
  // Preserve decimal places if present
  const hasDecimal = cleanStr.includes('.')
  const decimalPlaces = hasDecimal ? cleanStr.split('.')[1]?.length || 0 : 0
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: hasDecimal ? Math.min(decimalPlaces, 2) : 0,
    maximumFractionDigits: 2,
  })
}

