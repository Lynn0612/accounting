import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useLedger } from '@/contexts/LedgerContext'
import { useUser } from './useUser'

export type UserRole = 'Owner' | 'Member' | 'Viewer' | null

const getUserRole = async (ledgerId: string | null, ledgerType: 'ledger' | 'account_book' | undefined, userId: string | null): Promise<UserRole> => {
  if (!ledgerId || !userId) {
    console.log('[getUserRole] Missing params:', { ledgerId, ledgerType, userId })
    return null
  }

  const supabase = createClient()

  if (ledgerType === 'ledger') {
    console.log('[getUserRole] Querying ledger_members:', { ledgerId, userId })
    const { data, error } = await supabase
      .from('ledger_members')
      .select('role')
      .eq('ledger_id', ledgerId)
      .eq('user_id', userId)
      .single()

    console.log('[getUserRole] Query result:', { data, error, role: data?.role })
    if (error || !data) {
      console.log('[getUserRole] No role found or error:', error)
      return null
    }
    console.log('[getUserRole] Returning role:', data.role)
    return data.role as UserRole
  } else {
    // For account_books, check if user is owner or member
    // First check if owner
    const { data: book, error: bookError } = await supabase
      .from('account_books')
      .select('owner_id')
      .eq('id', ledgerId)
      .single()

    if (bookError) {
      console.log('[getUserRole] Error checking account_book owner:', bookError)
    } else if (book?.owner_id === userId) {
      return 'Owner'
    }

    // Then check book_members - ensure correct column names
    console.log('[getUserRole] Querying book_members:', { book_id: ledgerId, user_id: userId })
    const { data, error } = await supabase
      .from('book_members')
      .select('role')
      .eq('book_id', ledgerId)
      .eq('user_id', userId)
      .single()

    console.log('[getUserRole] book_members query result:', { data, error, role: data?.role })
    if (error || !data) {
      console.log('[getUserRole] No role found in book_members or error:', error)
      return null
    }
    return data.role as UserRole
  }
}

export function useCurrentUserRole() {
  const { activeLedger } = useLedger()
  const { data: user, isLoading: isLoadingUser } = useUser()

  // Wait for user session to be loaded before running query
  const enabled = !!activeLedger?.id && !!user?.id && !isLoadingUser
  
  console.log('[useCurrentUserRole] Hook called:', {
    activeLedgerId: activeLedger?.id,
    activeLedgerType: activeLedger?.type,
    userId: user?.id,
    isLoadingUser,
    enabled,
  })

  const query = useQuery({
    queryKey: ['currentUserRole', activeLedger?.id, activeLedger?.type, user?.id],
    queryFn: () => {
      console.log('[useCurrentUserRole] Query function called')
      return getUserRole(activeLedger?.id || null, activeLedger?.type, user?.id || null)
    },
    enabled,
    staleTime: 0, // Always refetch to get latest role
    gcTime: 2 * 60 * 1000, // 2 minutes
    retry: 2,
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  })

  const role = query.data
  const isViewer = role === 'Viewer'
  const canEdit = role !== 'Viewer' && role !== null

  console.log('[useCurrentUserRole] Query result:', {
    data: query.data,
    role,
    isViewer,
    canEdit,
    isLoading: query.isLoading,
    error: query.error,
    isEnabled: enabled,
  })

  return {
    ...query,
    role,
    isViewer,
    canEdit,
  }
}

