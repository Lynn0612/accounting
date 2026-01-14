import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

const getUser = async (): Promise<User | null> => {
  const supabase = createClient()
  
  // First, ensure we have a valid session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  
  if (sessionError) {
    console.error('[useUser] Session error:', sessionError)
    return null
  }
  
  if (!session || !session.user) {
    // Session not found - this is normal during initial load or when not authenticated
    return null
  }
  
  // Verify the user from the session
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError) {
    console.error('[useUser] Error getting user:', userError)
    return null
  }
  
  if (!user) {
    console.log('[useUser] No user found after getUser()')
    return null
  }
  
  return user
}

export function useUser() {
  return useQuery({
    queryKey: ['user'],
    queryFn: getUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  })
}

