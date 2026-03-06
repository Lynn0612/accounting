import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

const getProfiles = async (userIds: string[]): Promise<Map<string, Profile>> => {
  if (userIds.length === 0) {
    return new Map()
  }

  const supabase = createClient()
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds)

  if (error) {
    console.error('Error fetching profiles:', error)
    return new Map()
  }

  const profileMap = new Map<string, Profile>()
  profiles?.forEach((profile) => {
    profileMap.set(profile.id, {
      id: profile.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
    })
  })

  return profileMap
}

export function useProfiles(userIds: string[]) {
  return useQuery({
    queryKey: ['profiles', userIds.sort().join(',')],
    queryFn: () => getProfiles(userIds),
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

