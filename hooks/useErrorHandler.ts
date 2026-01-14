import { useState, useCallback } from 'react'

export interface ErrorInfo {
  message: string
  code?: string
  details?: string
  timestamp: Date
}

export function useErrorHandler() {
  const [error, setError] = useState<ErrorInfo | null>(null)
  const [isErrorVisible, setIsErrorVisible] = useState(false)

  const handleError = useCallback((error: unknown, customMessage?: string) => {
    let errorInfo: ErrorInfo

    if (error instanceof Error) {
      errorInfo = {
        message: customMessage || error.message || '發生未知錯誤',
        code: (error as any).code,
        details: error.stack,
        timestamp: new Date(),
      }
    } else if (typeof error === 'object' && error !== null) {
      const err = error as any
      errorInfo = {
        message: customMessage || err.message || err.error?.message || '發生未知錯誤',
        code: err.code || err.error?.code,
        details: err.details || err.hint || err.error?.details || err.error?.hint,
        timestamp: new Date(),
      }
    } else {
      errorInfo = {
        message: customMessage || String(error) || '發生未知錯誤',
        timestamp: new Date(),
      }
    }

    setError(errorInfo)
    setIsErrorVisible(true)

    // Auto hide after 5 seconds
    setTimeout(() => {
      setIsErrorVisible(false)
    }, 5000)

    // Log error for debugging
    console.error('Error handled:', errorInfo)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    setIsErrorVisible(false)
  }, [])

  return {
    error,
    isErrorVisible,
    handleError,
    clearError,
  }
}

