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

