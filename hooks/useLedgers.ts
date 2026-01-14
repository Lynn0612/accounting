import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import React from 'react'

export interface Ledger {
  id: string
  name: string
  description?: string | null
  created_at: string
  created_by?: string
  type?: 'ledger' | 'account_book'
}

export interface AccountBook {
  id: string
  name: string
  description?: string | null
  created_at?: string
  owner_id?: string
  type?: 'ledger' | 'account_book'
}

export type BookItem = Ledger | AccountBook

const getLedgers = async (): Promise<BookItem[]> => {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return []
  }

  // Fetch ledgers where user is a member
  const { data: ledgerMemberships } = await supabase
    .from('ledger_members')
    .select('ledger_id')
    .eq('user_id', user.id)

  const ledgerIds = ledgerMemberships?.map(m => m.ledger_id) || []

  // Fetch account_books where user is owner OR member
  const { data: bookMemberships } = await supabase
    .from('book_members')
    .select('book_id')
    .eq('user_id', user.id)

  const bookIds = bookMemberships?.map(m => m.book_id) || []

  // Fetch both ledgers (where user is a member) and account_books (where user is owner or member)
  const [ledgersResult, accountBooksResult] = await Promise.all([
    ledgerIds.length > 0
      ? supabase
          .from('ledgers')
          .select('id, name, description, created_at, created_by')
          .in('id', ledgerIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null },
    bookIds.length > 0
      ? supabase
          .from('account_books')
          .select('id, name, description, created_at, owner_id')
          .in('id', bookIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null }
  ])

  const allBooks: BookItem[] = []

  // Add ledgers
  if (ledgersResult.data) {
    ledgersResult.data.forEach(ledger => {
      allBooks.push({
        ...ledger,
        type: 'ledger',
        description: ledger.description || null,
      })
    })
  }

  // Add account_books
  if (accountBooksResult.data) {
    accountBooksResult.data.forEach(book => {
      allBooks.push({
        id: book.id,
        name: book.name,
        description: book.description || null,
        created_at: book.created_at || new Date().toISOString(),
        owner_id: book.owner_id,
        type: 'account_book'
      })
    })
  }

  // Sort by created_at (most recent first)
  allBooks.sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime()
    const dateB = new Date(b.created_at || 0).getTime()
    return dateB - dateA
  })

  return allBooks
}

export function useLedgers() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  const query = useQuery({
    queryKey: ['ledgers'],
    queryFn: getLedgers,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3, // Retry up to 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })

  // Set up realtime subscription for ledger_members and book_members changes
  React.useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      channel = supabase
        .channel(`ledger-members-changes-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'ledger_members',
            filter: `user_id=eq.${user.id}`, // Only listen to changes affecting current user
          },
          (payload) => {
            console.log('Ledger members change detected:', payload)
            // Invalidate and refetch ledgers when membership changes
            queryClient.invalidateQueries({ queryKey: ['ledgers'] })
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'book_members',
            filter: `user_id=eq.${user.id}`, // Only listen to changes affecting current user
          },
          (payload) => {
            console.log('Book members change detected:', payload)
            // Invalidate and refetch ledgers when membership changes
            queryClient.invalidateQueries({ queryKey: ['ledgers'] })
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status)
        })
    }

    setupSubscription()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [supabase, queryClient])

  return query
}

export function useRefreshLedgers() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['ledgers'] })
  }
}

