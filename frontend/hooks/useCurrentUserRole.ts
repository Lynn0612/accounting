import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useLedger } from '@/contexts/LedgerContext'
import { useUser } from './useUser'

export type UserRole = 'Owner' | 'Member' | 'Viewer' | null

const getUserRole = async (ledgerId: string | null, ledgerType: 'ledger' | 'account_book' | undefined, userId: string | null): Promise<UserRole> => {
  if (!ledgerId || !userId) {
    return null
  }

  const supabase = createClient()

  if (ledgerType === 'ledger') {
    // Use regular query instead of .single() to avoid 406 errors when RLS blocks access
    const { data, error } = await supabase
      .from('ledger_members')
      .select('role')
      .eq('ledger_id', ledgerId)
      .eq('user_id', userId)
      .limit(1)

    if (error || !data || data.length === 0) {
      return null
    }
    return data[0]?.role as UserRole
  } else {
    // For account_books, check if user is owner or member
    // First check if owner - use regular query instead of .single()
    const { data: books, error: bookError } = await supabase
      .from('account_books')
      .select('owner_id')
      .eq('id', ledgerId)
      .limit(1)

    if (!bookError && books && books.length > 0 && books[0]?.owner_id === userId) {
      return 'Owner'
    }

    // Then check book_members - ensure correct column names
    // Use regular query instead of .single()
    const { data, error } = await supabase
      .from('book_members')
      .select('role')
      .eq('book_id', ledgerId)
      .eq('user_id', userId)
      .limit(1)

    if (error || !data || data.length === 0) {
      return null
    }
    return data[0]?.role as UserRole
  }
}

export function useCurrentUserRole() {
  const { activeLedger } = useLedger()
  const { data: user, isLoading: isLoadingUser } = useUser()

  // Wait for user session to be loaded before running query
  const enabled = !!activeLedger?.id && !!user?.id && !isLoadingUser

  const query = useQuery({
    queryKey: ['currentUserRole', activeLedger?.id, activeLedger?.type, user?.id],
    queryFn: () => getUserRole(activeLedger?.id || null, activeLedger?.type, user?.id || null),
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes - 減少過度重新獲取
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    refetchOnMount: false, // 使用 staleTime 控制，不需要每次 mount 都重新獲取
    refetchOnWindowFocus: false, // 使用 staleTime 控制，不需要每次 focus 都重新獲取
  })

  const role = query.data
  const isViewer = role === 'Viewer'
  const canEdit = role !== 'Viewer' && role !== null

  return {
    ...query,
    role,
    isViewer,
    canEdit,
  }
}

