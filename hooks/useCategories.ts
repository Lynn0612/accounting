import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface Category {
  id: string
  name: string
  icon: string | null
  type: string
  ledger_id: string | null
  book_id: string | null
}

const getCategories = async (ledgerId: string | null, bookId: string | null, type?: 'expense' | 'income'): Promise<Category[]> => {
  const supabase = createClient()
  let query = supabase
    .from('categories')
    .select('id, name, icon, type, ledger_id, book_id')

  if (ledgerId) {
    query = query.eq('ledger_id', ledgerId)
  } else if (bookId) {
    query = query.eq('book_id', bookId)
  } else {
    return []
  }

  if (type) {
    const categoryTypeForDB = type === 'expense' ? 'Expense' : 'Income'
    query = query.eq('type', categoryTypeForDB)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching categories:', error)
    return []
  }

  return data || []
}

export function useCategories(ledgerId: string | null, type?: 'expense' | 'income', bookId?: string | null) {
  return useQuery({
    queryKey: ['categories', ledgerId, bookId, type],
    queryFn: () => getCategories(ledgerId, bookId || null, type),
    enabled: !!(ledgerId || bookId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3, // Retry up to 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: {
      ledger_id?: string | null
      book_id?: string | null
      name: string
      icon: string
      type: 'Expense' | 'Income'
    }) => {
      const insertData: any = {
        name: data.name,
        icon: data.icon,
        type: data.type,
      }
      
      if (data.ledger_id !== undefined && data.ledger_id !== null) {
        insertData.ledger_id = data.ledger_id
      }
      if (data.book_id !== undefined && data.book_id !== null) {
        insertData.book_id = data.book_id
      }

      const { data: newCategory, error } = await supabase
        .from('categories')
        .insert(insertData)
        .select('id')
        .single()

      if (error) throw error
      return newCategory
    },
    onMutate: async (newCategory) => {
      const queryKey = ['categories', newCategory.ledger_id || null, newCategory.book_id || null]
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot previous value
      const previousCategories = queryClient.getQueryData<Category[]>(queryKey)

      // Optimistically update
      queryClient.setQueryData<Category[]>(queryKey, (old = []) => [
        ...old,
        {
          id: `temp-${Date.now()}`,
          name: newCategory.name,
          icon: newCategory.icon,
          type: newCategory.type,
          ledger_id: newCategory.ledger_id || null,
          book_id: newCategory.book_id || null,
        },
      ])

      return { previousCategories }
    },
    onError: (err, newCategory, context) => {
      // Rollback on error
      const queryKey = ['categories', newCategory.ledger_id || null, newCategory.book_id || null]
      if (context?.previousCategories) {
        queryClient.setQueryData(queryKey, context.previousCategories)
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch categories to get the real ID
      const queryKey = ['categories', variables.ledger_id || null, variables.book_id || null]
      queryClient.invalidateQueries({ queryKey })
    },
    retry: 2, // Retry up to 2 times on failure
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: { categoryId: string; ledgerId?: string | null; bookId?: string | null }) => {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', data.categoryId)

      if (error) throw error
    },
    onMutate: async ({ categoryId, ledgerId, bookId }) => {
      const queryKey = ['categories', ledgerId || null, bookId || null]
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot previous value
      const previousCategories = queryClient.getQueryData<Category[]>(queryKey)

      // Optimistically update
      queryClient.setQueryData<Category[]>(queryKey, (old = []) =>
        old.filter((cat) => cat.id !== categoryId)
      )

      return { previousCategories }
    },
    onError: (err, variables, context) => {
      // Rollback on error
      const queryKey = ['categories', variables.ledgerId || null, variables.bookId || null]
      if (context?.previousCategories) {
        queryClient.setQueryData(queryKey, context.previousCategories)
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate and refetch categories
      const queryKey = ['categories', variables.ledgerId || null, variables.bookId || null]
      queryClient.invalidateQueries({ queryKey })
    },
    retry: 2, // Retry up to 2 times on failure
  })
}





