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

  // Check if it's a ledger or account_book, and fetch members and profiles in parallel
  // Use regular query instead of .single() to avoid 406 errors when RLS blocks access
  const [ledgerCheck, bookCheck] = await Promise.all([
    supabase
      .from('ledgers')
      .select('id')
      .eq('id', ledgerId)
      .limit(1),
    supabase
      .from('account_books')
      .select('id')
      .eq('id', ledgerId)
      .limit(1)
  ])

  const isLedger = !ledgerCheck.error && ledgerCheck.data && ledgerCheck.data.length > 0
  const isBook = !bookCheck.error && bookCheck.data && bookCheck.data.length > 0

  if (isLedger) {
    // It's a ledger - fetch members first, then profiles in parallel
    const membersResult = await supabase
      .from('ledger_members')
      .select('user_id')
      .eq('ledger_id', ledgerId)

    if (membersResult.error) {
      console.error('Error loading ledger members:', membersResult.error)
      return []
    }

    const userIds = membersResult.data?.map(m => m.user_id) || []
    if (userIds.length === 0) {
      return []
    }

    // Fetch profiles for these userIds (already optimized with .in())
    const profilesResult = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)

    if (profilesResult.error) {
      console.error('Error loading profiles:', profilesResult.error)
      return []
    }

    const profileMap = new Map((profilesResult.data || []).map(p => [p.id, p]))

    const membersList: Participant[] = []
    const currentUserProfile = profileMap.get(currentUserId)

    // Add current user first
    membersList.push({
      id: currentUserId,
      name: currentUserProfile?.full_name || 'You',
      avatar: currentUserProfile?.avatar_url || undefined,
      isPayer: true,
    })

    // Add other members (filter out Unknown and 3 test, only show 2 Test)
    userIds.forEach((userId) => {
      if (userId !== currentUserId) {
        const profile = profileMap.get(userId)
        if (profile) {
          const fullName = profile.full_name || 'Unknown'
          // Filter: only show "2 Test", exclude "Unknown" and "3 test"
          if (fullName === '2 Test' || (fullName !== 'Unknown' && fullName !== '3 test' && fullName !== '3 Test')) {
            membersList.push({
              id: userId,
              name: fullName,
              avatar: profile.avatar_url || undefined,
              isPayer: false,
            })
          }
        }
      }
    })

    return membersList
  } else if (isBook) {
    // It's an account_book - fetch members first, then profiles
    const membersResult = await supabase
      .from('book_members')
      .select('user_id')
      .eq('book_id', ledgerId)

    if (membersResult.error) {
      console.error('Error loading book members:', membersResult.error)
      return []
    }

    const userIds = membersResult.data?.map(m => m.user_id) || []
    if (userIds.length === 0) {
      return []
    }

    // Fetch profiles for these userIds (already optimized with .in())
    const profilesResult = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)

    if (profilesResult.error) {
      console.error('Error loading profiles:', profilesResult.error)
      return []
    }

    const profileMap = new Map((profilesResult.data || []).map(p => [p.id, p]))

    const membersList: Participant[] = []
    const currentUserProfile = profileMap.get(currentUserId)

    // Add current user first
    membersList.push({
      id: currentUserId,
      name: currentUserProfile?.full_name || 'You',
      avatar: currentUserProfile?.avatar_url || undefined,
      isPayer: true,
    })

    // Add other members (filter out Unknown and 3 test, only show 2 Test)
    userIds.forEach((userId) => {
      if (userId !== currentUserId) {
        const profile = profileMap.get(userId)
        if (profile) {
          const fullName = profile.full_name || 'Unknown'
          // Filter: only show "2 Test", exclude "Unknown" and "3 test"
          if (fullName === '2 Test' || (fullName !== 'Unknown' && fullName !== '3 test' && fullName !== '3 Test')) {
            membersList.push({
              id: userId,
              name: fullName,
              avatar: profile.avatar_url || undefined,
              isPayer: false,
            })
          }
        }
      }
    })

    return membersList
  }

  return []
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

