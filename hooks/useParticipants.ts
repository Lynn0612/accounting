import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface Participant {
  id: string
  name: string
  avatar?: string
  isPayer?: boolean
}

const getParticipants = async (ledgerId: string, currentUserId: string): Promise<Participant[]> => {
  const supabase = createClient()

  // Check if it's a ledger or account_book
  const { data: ledger } = await supabase
    .from('ledgers')
    .select('id')
    .eq('id', ledgerId)
    .single()

  if (ledger) {
    // It's a ledger - get members from ledger_members
    const { data: ledgerMembers, error: ledgerError } = await supabase
      .from('ledger_members')
      .select('user_id')
      .eq('ledger_id', ledgerId)

    if (ledgerError) {
      console.error('Error loading ledger members:', ledgerError)
      return []
    }

    const userIds = ledgerMembers?.map(m => m.user_id) || []
    if (userIds.length === 0) {
      return []
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)

    if (profilesError) {
      console.error('Error loading profiles:', profilesError)
      return []
    }

    const membersList: Participant[] = []

    // Find current user's profile first
    const currentUserProfile = profiles?.find(p => p.id === currentUserId)
    
    // Add current user first
    membersList.push({
      id: currentUserId,
      name: currentUserProfile?.full_name || 'You',
      avatar: currentUserProfile?.avatar_url || undefined,
      isPayer: true,
    })

    // Add other members
    if (profiles) {
      profiles.forEach((profile) => {
        if (profile.id !== currentUserId) {
          membersList.push({
            id: profile.id,
            name: profile.full_name || 'Unknown',
            avatar: profile.avatar_url || undefined,
            isPayer: false,
          })
        }
      })
    }

    return membersList
  } else {
    // It's an account_book - get members from book_members
    const { data: bookMembers, error: bookError } = await supabase
      .from('book_members')
      .select('user_id')
      .eq('book_id', ledgerId)

    if (bookError) {
      console.error('Error loading book members:', bookError)
      return []
    }

    const userIds = bookMembers?.map(m => m.user_id) || []
    if (userIds.length === 0) {
      return []
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)

    if (profilesError) {
      console.error('Error loading profiles:', profilesError)
      return []
    }

    const membersList: Participant[] = []

    // Find current user's profile first
    const currentUserProfile = profiles?.find(p => p.id === currentUserId)
    
    // Add current user first
    membersList.push({
      id: currentUserId,
      name: currentUserProfile?.full_name || 'You',
      avatar: currentUserProfile?.avatar_url || undefined,
      isPayer: true,
    })

    // Add other members
    if (profiles) {
      profiles.forEach((profile) => {
        if (profile.id !== currentUserId) {
          membersList.push({
            id: profile.id,
            name: profile.full_name || 'Unknown',
            avatar: profile.avatar_url || undefined,
            isPayer: false,
          })
        }
      })
    }

    return membersList
  }
}

export function useParticipants(ledgerId: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['participants', ledgerId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ledgerId) {
        return []
      }
      return getParticipants(ledgerId, user.id)
    },
    enabled: !!ledgerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3, // Retry up to 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })
}

