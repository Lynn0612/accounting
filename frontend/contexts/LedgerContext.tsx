"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from "react";
import { useLedgers, useRefreshLedgers, BookItem } from "@/hooks/useLedgers";
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';

interface LedgerContextType {
  ledgers: BookItem[];
  activeLedger: BookItem | null;
  setActiveLedger: (ledger: BookItem | null) => void;
  refreshLedgers: () => Promise<void>;
  loading: boolean;
  isViewer: boolean;
  userRole: 'Owner' | 'Member' | 'Viewer' | null;
}

const LedgerContext = createContext<LedgerContextType | undefined>(undefined);

// Cache key for localStorage
const ACTIVE_LEDGER_ID_KEY = 'activeLedgerId';
const ACTIVE_LEDGER_TYPE_KEY = 'activeLedgerType';

// Helper function to get user role (moved outside to avoid circular dependency)
const getUserRole = async (ledgerId: string | null, ledgerType: 'ledger' | 'account_book' | undefined, userId: string | null): Promise<'Owner' | 'Member' | 'Viewer' | null> => {
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
    return data[0]?.role as 'Owner' | 'Member' | 'Viewer' | null
  } else {
    // For account_books, check if user is owner or member
    // Use regular query instead of .single()
    const { data: books, error: bookError } = await supabase
      .from('account_books')
      .select('owner_id')
      .eq('id', ledgerId)
      .limit(1)

    if (!bookError && books && books.length > 0 && books[0]?.owner_id === userId) {
      return 'Owner'
    }

    const { data, error } = await supabase
      .from('book_members')
      .select('role')
      .eq('book_id', ledgerId)
      .eq('user_id', userId)
      .limit(1)

    if (error || !data || data.length === 0) {
      return null
    }
    return data[0]?.role as 'Owner' | 'Member' | 'Viewer' | null
  }
}

export function LedgerProvider({ children, initialLedgers = [] }: { children: ReactNode; initialLedgers?: BookItem[] }) {
  const { data: ledgersData = [], isLoading } = useLedgers();
  const refreshLedgersQuery = useRefreshLedgers();
  const [activeLedger, setActiveLedgerState] = useState<BookItem | null>(null);
  const isInitializedRef = useRef(false);
  
  // Get current user
  const { data: user } = useUser();
  
  // Get current user's role for the active ledger (without using useCurrentUserRole to avoid circular dependency)
  const { data: userRole } = useQuery({
    queryKey: ['currentUserRole', activeLedger?.id, activeLedger?.type, user?.id],
    queryFn: () => getUserRole(activeLedger?.id || null, activeLedger?.type, user?.id || null),
    enabled: !!activeLedger?.id && !!user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes - 與 useCurrentUserRole 保持一致，減少過度重新獲取
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    refetchOnMount: false, // 使用 staleTime 控制，不需要每次 mount 都重新獲取
    refetchOnWindowFocus: false, // 使用 staleTime 控制，不需要每次 focus 都重新獲取
  });
  
  const isViewer = userRole === 'Viewer';

  // Memoize ledgers to avoid unnecessary recalculations
  const ledgers = useMemo(() => {
    return ledgersData.length > 0 ? ledgersData : initialLedgers;
  }, [ledgersData, initialLedgers]);

  // Memoize saved ledger lookup to avoid repeated localStorage reads
  const getSavedLedger = useCallback((ledgers: BookItem[]): BookItem | null => {
    if (typeof window === 'undefined') return null;
    
    const savedLedgerId = localStorage.getItem(ACTIVE_LEDGER_ID_KEY);
    const savedLedgerType = localStorage.getItem(ACTIVE_LEDGER_TYPE_KEY);
    
    if (!savedLedgerId || !savedLedgerType) return null;
    
    return ledgers.find(l => l.id === savedLedgerId && l.type === savedLedgerType) || null;
  }, []);

  // Memoize default ledger selection logic
  const getDefaultLedger = useCallback((ledgers: BookItem[]): BookItem | null => {
    if (ledgers.length === 0) return null;
    
    const savedLedger = getSavedLedger(ledgers);
    return savedLedger || ledgers[0];
  }, [getSavedLedger]);

  // Initialize active ledger when ledgers are loaded (restore from localStorage if available)
  useEffect(() => {
    // Only initialize when we have ledgers and activeLedger is not set
    if (isLoading || ledgers.length === 0 || activeLedger) {
      return;
    }

    const defaultLedger = getDefaultLedger(ledgers);
    
    if (defaultLedger) {
      setActiveLedgerState(defaultLedger);
      
      // Update localStorage to ensure consistency
      if (typeof window !== 'undefined') {
        localStorage.setItem(ACTIVE_LEDGER_ID_KEY, defaultLedger.id);
        localStorage.setItem(ACTIVE_LEDGER_TYPE_KEY, defaultLedger.type || 'ledger');
      }
      
      isInitializedRef.current = true;
    }
  }, [ledgers, isLoading, activeLedger, getDefaultLedger]);

  // Handle case when ledgers become empty (e.g., user logged out)
  useEffect(() => {
    if (!isLoading && ledgers.length === 0 && activeLedger) {
      setActiveLedgerState(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ACTIVE_LEDGER_ID_KEY);
        localStorage.removeItem(ACTIVE_LEDGER_TYPE_KEY);
      }
      isInitializedRef.current = false;
    }
  }, [ledgers.length, isLoading, activeLedger]);

  // Handle case when saved ledger is no longer in the list
  useEffect(() => {
    if (!isLoading && ledgers.length > 0 && activeLedger) {
      const ledgerStillExists = ledgers.some(
        l => l.id === activeLedger.id && l.type === activeLedger.type
      );
      
      if (!ledgerStillExists) {
        // Saved ledger no longer exists, switch to default
        const defaultLedger = getDefaultLedger(ledgers);
        setActiveLedgerState(defaultLedger);
        
        if (defaultLedger && typeof window !== 'undefined') {
          localStorage.setItem(ACTIVE_LEDGER_ID_KEY, defaultLedger.id);
          localStorage.setItem(ACTIVE_LEDGER_TYPE_KEY, defaultLedger.type || 'ledger');
        }
      }
    }
  }, [ledgers, activeLedger, isLoading, getDefaultLedger]);

  // Memoize setActiveLedger to avoid unnecessary re-renders
  const setActiveLedger = useCallback((ledger: BookItem | null) => {
    setActiveLedgerState(ledger);
    
    if (typeof window !== 'undefined') {
      if (ledger) {
        localStorage.setItem(ACTIVE_LEDGER_ID_KEY, ledger.id);
        localStorage.setItem(ACTIVE_LEDGER_TYPE_KEY, ledger.type || 'ledger');
      } else {
        localStorage.removeItem(ACTIVE_LEDGER_ID_KEY);
        localStorage.removeItem(ACTIVE_LEDGER_TYPE_KEY);
      }
    }
  }, []);

  // Memoize refreshLedgers to avoid unnecessary re-renders
  const refreshLedgers = useCallback(async () => {
    await refreshLedgersQuery();
  }, [refreshLedgersQuery]);

  // Memoize context value to avoid unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({
      ledgers,
      activeLedger,
      setActiveLedger,
      refreshLedgers,
      loading: isLoading,
      isViewer,
      userRole: userRole || null,
    }),
    [ledgers, activeLedger, setActiveLedger, refreshLedgers, isLoading, isViewer, userRole]
  );

  return (
    <LedgerContext.Provider value={contextValue}>
      {children}
    </LedgerContext.Provider>
  );
}

export function useLedger() {
  const context = useContext(LedgerContext);
  if (context === undefined) {
    throw new Error("useLedger must be used within a LedgerProvider");
  }
  return context;
}

