"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X, Edit3 } from "lucide-react";
import NumericKeypad from "@/components/NumericKeypad";
import CategoryPicker from "@/components/CategoryPicker";
import SelectParticipants from "@/components/SelectParticipants";
import DatePickerModal from "@/components/DatePickerModal";
import ErrorToast from "@/components/ErrorToast";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useLedger } from "@/contexts/LedgerContext";
import { useParticipants } from "@/hooks/useParticipants";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { useCurrentUserRole, type UserRole } from "@/hooks/useCurrentUserRole";
import { useUser as useUserHook } from "@/hooks/useUser";
import { formatSimpleDate } from "@/utils/date";
import LedgerDropdown from "@/components/LedgerDropdown";
import Loading from "@/components/Loading";
import { formatAmountString } from "@/utils/formatAmount";

interface Participant {
  id: string;
  name: string;
  avatar?: string;
  isPayer?: boolean;
}

function AddTransactionPageContent() {
  const DEPOSIT_PAYER_ID = '__DEPOSIT__'
  // ========== ALL HOOKS MUST BE CALLED FIRST ==========
  // Router and Supabase
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  // 追蹤是否為直接進入（在組件掛載時記錄）
  const [isDirectAccess, setIsDirectAccess] = useState(false);
  
  useEffect(() => {
    // 檢查是否為直接進入（沒有 referrer 或 referrer 不是當前網站的頁面）
    const referrer = document.referrer;
    const currentOrigin = window.location.origin;
    const isDirect = !referrer || !referrer.startsWith(currentOrigin);
    setIsDirectAccess(isDirect);
  }, []);
  
  // Context hooks
  const { activeLedger, setActiveLedger, ledgers, refreshLedgers } = useLedger();
  
  // Custom hooks - must be called unconditionally
  const { data: userFromHook, isLoading: isLoadingUserFromHook } = useUserHook();
  const { role, isViewer, isLoading: isLoadingRole } = useCurrentUserRole();
  const { error, isErrorVisible, handleError, clearError } = useErrorHandler();
  const { data: participantsData = [], isLoading: loadingParticipants } = useParticipants(
    activeLedger?.id || null
  );

  // State hooks - all useState calls must be at the top
  const [user, setUser] = useState<any>(null);
  const [transactionType, setTransactionType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("0");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isPublicExpense, setIsPublicExpense] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showPayerModal, setShowPayerModal] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [showKeypad, setShowKeypad] = useState(true);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [repaymentParticipantIds, setRepaymentParticipantIds] = useState<string[]>([]);
  const [showRepaymentModal, setShowRepaymentModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [publicShareParticipantIds, setPublicShareParticipantIds] = useState<string[]>([]);
  const [publicAmount, setPublicAmount] = useState<string>('');
  const [publicAmountManuallySet, setPublicAmountManuallySet] = useState(false);
  const [shouldResetAmount, setShouldResetAmount] = useState(false);
  const [showPublicShareModal, setShowPublicShareModal] = useState(false);
  const [payerId, setPayerId] = useState<string>('');
  const [depositManagerId, setDepositManagerId] = useState<string>('');
  const [depositParticipantIds, setDepositParticipantIds] = useState<string[]>([]);
  const [depositSplitAmounts, setDepositSplitAmounts] = useState<Record<string, string>>({});
  const [participantsModalMode, setParticipantsModalMode] = useState<'expense' | 'deposit'>('expense');
  const [payerModalMode, setPayerModalMode] = useState<'expense' | 'deposit'>('expense');
  const [customSplitAmounts, setCustomSplitAmounts] = useState<Record<string, string>>({});
  const [incomeMode, setIncomeMode] = useState<'personal' | 'deposit' | 'bonus'>('personal');
  const [saving, setSaving] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [editingAmountType, setEditingAmountType] = useState<'main' | 'depositSplit' | 'customSplit' | 'publicAmount' | null>(null);
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const editingInputRef = useRef<HTMLInputElement | null>(null);

  const toLocalDateString = useCallback((date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [])

  // Derived values (computed after hooks)
  const currentUser = userFromHook || user;
  const participants = participantsData;
  const isMultiMemberLedger = participants.length > 1
  const expensePayerOptions = useMemo(() => {
    if (!isMultiMemberLedger) return participants
    const depositOption = { id: DEPOSIT_PAYER_ID, name: 'Deposit' } as any
    return [depositOption, ...participants]
  }, [participants, isMultiMemberLedger])
  const isLoadingUserOrRole = isLoadingUserFromHook || isLoadingRole;

  useEffect(() => {
    if (!isMultiMemberLedger) {
      if (incomeMode === 'deposit') setIncomeMode('personal')
      if (payerId === DEPOSIT_PAYER_ID) setPayerId(currentUser?.id || '')
    }
  }, [isMultiMemberLedger, incomeMode, payerId, currentUser?.id])

  // ========== EFFECTS (AFTER ALL HOOKS) ==========
  // Check role from URL parameter - if Viewer, redirect to home and clear activeLedger
  // No automatic redirect for Viewer - show permission denied UI instead

  // Set activeLedger based on URL parameters or use saved/current activeLedger (only if not Viewer)
  useEffect(() => {
    if (isLoadingUserFromHook || !currentUser || ledgers.length === 0) {
      return;
    }

    // Don't set activeLedger if role is Viewer
    const roleFromUrl = searchParams.get('role') as 'Owner' | 'Member' | 'Viewer' | null;
    if (roleFromUrl === 'Viewer') {
      return;
    }

    const ledgerIdFromUrl = searchParams.get('ledger_id');
    const bookIdFromUrl = searchParams.get('book_id');
    
    let targetLedger = null;
    
    // Priority 1: Use ledger from URL parameters
    if (ledgerIdFromUrl) {
      targetLedger = ledgers.find(l => l.id === ledgerIdFromUrl && l.type === 'ledger');
    } else if (bookIdFromUrl) {
      targetLedger = ledgers.find(l => l.id === bookIdFromUrl && l.type === 'account_book');
    }
    
    // Priority 2: Use current activeLedger (from localStorage, restored by LedgerContext)
    if (!targetLedger && activeLedger) {
      // Verify the activeLedger still exists in the ledgers list
      const ledgerStillExists = ledgers.some(
        l => l.id === activeLedger.id && l.type === activeLedger.type
      );
      if (ledgerStillExists) {
        targetLedger = activeLedger;
      }
    }
    
    // Priority 3: Try to get saved ledger from localStorage
    if (!targetLedger && typeof window !== 'undefined') {
      const savedLedgerId = localStorage.getItem('activeLedgerId');
      const savedLedgerType = localStorage.getItem('activeLedgerType');
      if (savedLedgerId && savedLedgerType) {
        targetLedger = ledgers.find(l => l.id === savedLedgerId && l.type === savedLedgerType) || null;
      }
    }
    
    // Priority 4: Fallback to first ledger
    if (!targetLedger) {
      targetLedger = ledgers[0];
    }
    
    // Only set if we found a target and it's different from current activeLedger
    if (targetLedger?.id && (!activeLedger || activeLedger.id !== targetLedger.id || activeLedger.type !== targetLedger.type)) {
      setActiveLedger(targetLedger);
    }
  }, [activeLedger, ledgers, currentUser, isLoadingUserFromHook, searchParams, setActiveLedger]);

  // Check if user has access to ledger from URL parameters and redirect if not
  useEffect(() => {
    if (isLoadingUserFromHook || !currentUser) {
      return;
    }

    const ledgerIdFromUrl = searchParams.get('ledger_id');
    const bookIdFromUrl = searchParams.get('book_id');
    const roleFromUrl = searchParams.get('role');
    
    // If URL has ledger/book parameters, verify user has access
    if (ledgerIdFromUrl || bookIdFromUrl) {
      const targetLedgerId = ledgerIdFromUrl || bookIdFromUrl;
      const targetLedgerType = ledgerIdFromUrl ? 'ledger' : 'account_book';
      
      // Check if user has access to this ledger
      const checkAccess = async () => {
        let hasAccess = false;
        
        if (targetLedgerType === 'ledger') {
          const { data, error } = await supabase
            .from('ledger_members')
            .select('role')
            .eq('ledger_id', targetLedgerId)
            .eq('user_id', currentUser.id)
            .limit(1);
          
          hasAccess = !error && data && data.length > 0;
        } else {
          // Check account_book
          const { data: book, error: bookError } = await supabase
            .from('account_books')
            .select('owner_id')
            .eq('id', targetLedgerId)
            .limit(1);
          
          if (!bookError && book && book.length > 0) {
            if (book[0]?.owner_id === currentUser.id) {
              hasAccess = true;
            } else {
              const { data, error } = await supabase
                .from('book_members')
                .select('role')
                .eq('book_id', targetLedgerId)
                .eq('user_id', currentUser.id)
                .limit(1);
              
              hasAccess = !error && data && data.length > 0;
            }
          }
        }
        
        // If user doesn't have access, redirect to home
        if (!hasAccess) {
          router.push('/');
        }
      };
      
      checkAccess();
    }
  }, [currentUser, isLoadingUserFromHook, searchParams, router, supabase]);

  // Redirect to URL with parameters if activeLedger exists but URL has no parameters
  useEffect(() => {
    if (isLoadingUserFromHook || !currentUser || !activeLedger || isLoadingRole) {
      return;
    }

    const ledgerIdFromUrl = searchParams.get('ledger_id');
    const bookIdFromUrl = searchParams.get('book_id');
    const roleFromUrl = searchParams.get('role');
    
    // If activeLedger exists but URL has no parameters, redirect to add parameters with role
    if ((!ledgerIdFromUrl && !bookIdFromUrl) || !roleFromUrl) {
      const ledgerParam = activeLedger.type === 'ledger' 
        ? `ledger_id=${activeLedger.id}`
        : `book_id=${activeLedger.id}`;
      const roleParam = role ? `&role=${role}` : '';
      router.replace(`/add?${ledgerParam}${roleParam}`);
      return;
    }
  }, [activeLedger, currentUser, isLoadingUserFromHook, isLoadingRole, role, searchParams, router]);

  // Load user and set default payer ID
  // Use userFromHook if available, otherwise try to get from auth
  useEffect(() => {
    if (userFromHook) {
      setUser(userFromHook);
      // Only set default payer ID, don't auto-select participants
      if (payerId === "you" || !payerId) {
        setPayerId(userFromHook.id);
      }
      if (depositManagerId === "you" || !depositManagerId) {
        setDepositManagerId(userFromHook.id);
      }
    } else {
      // Fallback: try to get user from auth
      const loadUser = async () => {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          setUser(currentUser);
          // Only set default payer ID, don't auto-select participants
          if (payerId === "you" || !payerId) {
            setPayerId(currentUser.id);
          }
          if (depositManagerId === "you" || !depositManagerId) {
            setDepositManagerId(currentUser.id);
          }
        }
      };
      loadUser();
    }
  }, [userFromHook, supabase, payerId, depositManagerId]);

  // Handle ledger selection change - update URL with new ledger and role
  const handleLedgerChange = useCallback(async (newLedger: typeof ledgers[0]) => {
    if (!newLedger || !currentUser) return;
    
    setActiveLedger(newLedger);
    
    // Get user role for the new ledger
    let newRole: 'Owner' | 'Member' | 'Viewer' | null = null;
    
    if (newLedger.type === 'ledger') {
      const { data, error } = await supabase
        .from('ledger_members')
        .select('role')
        .eq('ledger_id', newLedger.id)
        .eq('user_id', currentUser.id)
        .single();
      
      if (!error && data) {
        newRole = data.role as 'Owner' | 'Member' | 'Viewer';
      }
    } else {
      // For account_books, check if user is owner or member
      const { data: book } = await supabase
        .from('account_books')
        .select('owner_id')
        .eq('id', newLedger.id)
        .single();
      
      if (book?.owner_id === currentUser.id) {
        newRole = 'Owner';
      } else {
        const { data, error } = await supabase
          .from('book_members')
          .select('role')
          .eq('book_id', newLedger.id)
          .eq('user_id', currentUser.id)
          .single();
        
        if (!error && data) {
          newRole = data.role as 'Owner' | 'Member' | 'Viewer';
        }
      }
    }
    
    // Update URL with new ledger and role
    const ledgerParam = newLedger.type === 'ledger' 
      ? `ledger_id=${newLedger.id}`
      : `book_id=${newLedger.id}`;
    const roleParam = newRole ? `&role=${newRole}` : '';
    router.replace(`/add?${ledgerParam}${roleParam}`);
  }, [currentUser, setActiveLedger, supabase, router]);

  const handleKeypadInput = useCallback((value: string) => {
    const handleInput = (prev: string) => {
      if (shouldResetAmount && !["+", "-", "×", "÷"].includes(value)) {
        setShouldResetAmount(false);
        if (value === ".") {
          return "0.";
        }
        return value;
      }
      
      if (prev === "0" && value !== "." && !["+", "-", "×", "÷"].includes(value)) {
        return value;
      }
      
      if (value === ".") {
        // Split by operators to find the last numeric part
        const parts = prev.split(/[+\-×÷]/);
        const lastPart = parts[parts.length - 1];
        if (lastPart.includes(".")) {
          return prev;
        }
      }

      if (["+", "-", "×", "÷"].includes(value)) {
        if (["+", "-", "×", "÷"].includes(prev.slice(-1))) {
          return prev.slice(0, -1) + value;
        }
        return prev + value;
      }
      return prev + value;
    };

    if (editingAmountType === 'depositSplit' && editingAmountId) {
      setDepositSplitAmounts((prev) => {
        const current = prev[editingAmountId] || "0";
        return { ...prev, [editingAmountId]: handleInput(current) };
      });
    } else if (editingAmountType === 'customSplit' && editingAmountId) {
      setCustomSplitAmounts((prev) => {
        const current = prev[editingAmountId] || "0";
        return { ...prev, [editingAmountId]: handleInput(current) };
      });
    } else if (editingAmountType === 'publicAmount') {
      setPublicAmount((prev) => handleInput(prev || "0"));
    } else {
      // Main amount
      setAmount((prev) => handleInput(prev));
    }
  }, [shouldResetAmount, editingAmountType, editingAmountId]);

  const handleClear = useCallback(() => {
    if (editingAmountType === 'depositSplit' && editingAmountId) {
      setDepositSplitAmounts((prev) => ({ ...prev, [editingAmountId]: "0" }));
    } else if (editingAmountType === 'customSplit' && editingAmountId) {
      setCustomSplitAmounts((prev) => ({ ...prev, [editingAmountId]: "0" }));
    } else if (editingAmountType === 'publicAmount') {
      setPublicAmount("0");
    } else {
      setAmount("0");
    }
  }, [editingAmountType, editingAmountId]);

  const handleBackspace = useCallback(() => {
    if (editingAmountType === 'depositSplit' && editingAmountId) {
      setDepositSplitAmounts((prev) => {
        const current = prev[editingAmountId] || "0";
        if (current.length <= 1) return { ...prev, [editingAmountId]: "0" };
        return { ...prev, [editingAmountId]: current.slice(0, -1) };
      });
    } else if (editingAmountType === 'customSplit' && editingAmountId) {
      setCustomSplitAmounts((prev) => {
        const current = prev[editingAmountId] || "0";
        if (current.length <= 1) return { ...prev, [editingAmountId]: "0" };
        return { ...prev, [editingAmountId]: current.slice(0, -1) };
      });
    } else if (editingAmountType === 'publicAmount') {
      setPublicAmount((prev) => {
        if (prev.length <= 1) return "0";
        return prev.slice(0, -1);
      });
    } else {
      setAmount((prev) => {
        if (prev.length <= 1) return "0";
        return prev.slice(0, -1);
      });
    }
  }, [editingAmountType, editingAmountId]);

  const handleCalculate = useCallback(() => {
    try {
      let currentValue = "";
      if (editingAmountType === 'depositSplit' && editingAmountId) {
        currentValue = depositSplitAmounts[editingAmountId] || "0";
      } else if (editingAmountType === 'customSplit' && editingAmountId) {
        currentValue = customSplitAmounts[editingAmountId] || "0";
      } else if (editingAmountType === 'publicAmount') {
        currentValue = publicAmount || "0";
      } else {
        currentValue = amount;
      }

      let expression = currentValue
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/[^0-9+\-*/.() ]/g, "");
      
      if (!expression || expression === "0") {
        return;
      }

      const result = Function(`"use strict"; return (${expression})`)();
      const numResult = Number(result);
      
      if (isNaN(numResult) || !isFinite(numResult)) {
        return;
      }

      const formatted = numResult % 1 === 0 
        ? numResult.toString() 
        : numResult.toFixed(2).replace(/\.?0+$/, "");
      
      if (editingAmountType === 'depositSplit' && editingAmountId) {
        setDepositSplitAmounts((prev) => ({ ...prev, [editingAmountId]: formatted }));
      } else if (editingAmountType === 'customSplit' && editingAmountId) {
        setCustomSplitAmounts((prev) => ({ ...prev, [editingAmountId]: formatted }));
      } else if (editingAmountType === 'publicAmount') {
        setPublicAmount(formatted);
      } else {
        setAmount(formatted);
      }
    } catch {
      // Invalid expression, keep current amount
    }
  }, [amount, editingAmountType, editingAmountId, depositSplitAmounts, customSplitAmounts, publicAmount]);

  const handleConfirmAmount = useCallback(() => {
    let currentValue = "";
    if (editingAmountType === 'depositSplit' && editingAmountId) {
      currentValue = depositSplitAmounts[editingAmountId] || "0";
    } else if (editingAmountType === 'customSplit' && editingAmountId) {
      currentValue = customSplitAmounts[editingAmountId] || "0";
    } else if (editingAmountType === 'publicAmount') {
      currentValue = publicAmount || "0";
    } else {
      currentValue = amount;
    }

    if (currentValue.includes("+") || currentValue.includes("×") || currentValue.includes("÷") || (currentValue.includes("-") && currentValue.split("-").length > 2)) {
      handleCalculate();
    }
    
    if (editingAmountType === 'main') {
      const num = parseFloat(amount);
      if (!isNaN(num) && num > 0) {
        setShowKeypad(false);
      }
    } else {
      // For other amount types, just close the keypad
      setShowKeypad(false);
      setEditingAmountType(null);
      setEditingAmountId(null);
    }
  }, [amount, editingAmountType, editingAmountId, depositSplitAmounts, customSplitAmounts, publicAmount, handleCalculate]);

  // Auto-disable shared expense if ledger becomes single-member
  useEffect(() => {
    if (!isMultiMemberLedger && isPublicExpense) {
      setIsPublicExpense(false)
    }
  }, [isMultiMemberLedger, isPublicExpense])

  // Scroll to editing input when keypad opens - ensure input is visible above keypad
  useEffect(() => {
    if (showKeypad && editingInputRef.current) {
      setTimeout(() => {
        const inputElement = editingInputRef.current;
        if (inputElement) {
          const keypadHeight = 400; // Approximate keypad height
          const extraPadding = 100; // Extra space above input to ensure it's fully visible
          
          // Find the scrollable container
          let scrollContainer: HTMLElement | null = inputElement.closest('.overflow-y-auto') as HTMLElement;
          if (!scrollContainer) {
            scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement;
          }
          
          if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const inputRect = inputElement.getBoundingClientRect();
            const currentScrollTop = scrollContainer.scrollTop;
            
            // Calculate input's position relative to container
            const inputRelativeTop = inputRect.top - containerRect.top + currentScrollTop;
            
            // Calculate target scroll position: input should be at top 1/3 of visible area (above keypad)
            const visibleHeight = containerRect.height - keypadHeight;
            const targetScrollTop = inputRelativeTop - (visibleHeight / 3) - extraPadding;
            
            scrollContainer.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          } else {
            // Fallback to window scroll
            const inputRect = inputElement.getBoundingClientRect();
            const visibleHeight = window.innerHeight - keypadHeight;
            const targetScrollTop = inputRect.top + window.scrollY - (visibleHeight / 3) - extraPadding;
            
            window.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          }
        }
      }, 200);
    }
  }, [showKeypad, editingAmountType, editingAmountId]);

  // Manual scroll to top on mount to avoid Next.js auto-scroll warnings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }, [])

  // Update public amount when amount changes
  // - Default behavior (no custom split amounts): Total ÷ public share member count
  // - If shared expense is enabled AND user has entered any Split with custom amounts:
  //   publicAmount defaults to (Total - sum(custom split amounts))
  useEffect(() => {
    if (isPublicExpense && amount) {
      const totalAmount = parseFloat(amount) || 0;
      if (totalAmount > 0) {
        const totalInt = Math.ceil(totalAmount);
        // Only auto-update if user hasn't manually set it
        if (!publicAmountManuallySet) {
          // Use public share participants count if set, otherwise use all participants
          const publicShareCount = publicShareParticipantIds.length > 0 
            ? publicShareParticipantIds.length 
            : participants.length;
          const memberCount = Math.max(1, publicShareCount || 1);

          const sumCustom = selectedParticipantIds.reduce((sum, id) => {
            const v = customSplitAmounts[id];
            const n = Number(v);
            if (v === undefined || v === "" || isNaN(n) || n <= 0) return sum;
            return sum + Math.ceil(n);
          }, 0);

          const calculatedPublicAmount =
            sumCustom > 0 ? Math.max(0, totalInt - sumCustom) : Math.ceil(totalInt / memberCount);

          setPublicAmount(calculatedPublicAmount.toString());
        }
      }
    } else {
      setPublicAmount('');
      setPublicAmountManuallySet(false);
    }
  }, [amount, isPublicExpense, publicAmountManuallySet, participants.length, publicShareParticipantIds.length, selectedParticipantIds, customSplitAmounts]);

  const getEffectiveSplitWithIds = useCallback((): string[] => {
    if (selectedParticipantIds.length > 0) return selectedParticipantIds;
    if (payerId === DEPOSIT_PAYER_ID) return participants.map((p) => p.id).filter(Boolean)
    return payerId ? [payerId] : [];
  }, [selectedParticipantIds, payerId, participants, DEPOSIT_PAYER_ID]);

  const computeCustomSplits = useCallback((total: number, ids: string[], overrideAmounts?: Record<string, string>) => {
    const totalInt = Math.max(0, Math.ceil(Number(total) || 0));
    const normalizedIds = ids.filter(Boolean);
    const amountsMap = overrideAmounts ?? customSplitAmounts;
    const fixed: Record<string, number> = {};
    let fixedSum = 0;
    const remainingIds: string[] = [];

    for (const id of normalizedIds) {
      const v = amountsMap[id];
      if (v === undefined || v === "") {
        remainingIds.push(id);
        continue;
      }
      const n = Number(v);
      if (!isNaN(n) && n >= 0) {
        const amt = Math.ceil(n);
        fixed[id] = amt;
        fixedSum += amt;
      } else {
        remainingIds.push(id);
      }
    }

    if (fixedSum > totalInt) {
      return { ok: false as const, amounts: {} as Record<string, number> };
    }

    const remaining = totalInt - fixedSum;
    const autoCount = remainingIds.length;
    const autoAmounts: Record<string, number> = {};
    if (autoCount > 0) {
      // Everyone rounds up to integer; any extra due to rounding belongs to payer.
      const per = Math.ceil(remaining / autoCount);
      for (let i = 0; i < remainingIds.length; i++) {
        const id = remainingIds[i];
        autoAmounts[id] = per;
      }
    }

    const amounts: Record<string, number> = {};
    for (const id of normalizedIds) {
      if (fixed[id] !== undefined) amounts[id] = fixed[id];
      else amounts[id] = autoAmounts[id] ?? 0;
    }

    return { ok: true as const, amounts };
  }, [customSplitAmounts]);

  const isValidAmount = () => {
    const num = parseFloat(amount);
    return (
      amount !== "0" &&
      !isNaN(num) &&
      num > 0 &&
      !amount.includes("+") &&
      !amount.includes("×") &&
      !amount.includes("÷") &&
      !(amount.includes("-") && amount.split("-").length > 2)
    );
  };

  // Update selectedCategoryName when selectedCategory changes
  useEffect(() => {
    const fetchCategoryName = async () => {
      if (!selectedCategory) {
        setSelectedCategoryName(null);
        setRepaymentParticipantIds([]); // Clear repayment participants when no category selected
        return;
      }

      try {
        const { data: category } = await supabase
          .from('categories')
          .select('name')
          .eq('id', selectedCategory)
          .maybeSingle();
        
        const categoryName = category?.name || null;
        setSelectedCategoryName(categoryName);
        
        // Clear repayment participants if category is not "To receive from"
        if (categoryName !== 'To receive from') {
          setRepaymentParticipantIds([]);
        }
      } catch (error) {
        console.error('Error fetching category name:', error);
        setSelectedCategoryName(null);
        setRepaymentParticipantIds([]);
      }
    };

    fetchCategoryName();
  }, [selectedCategory, supabase]);

  // Calculate split summary for display (match /edit "payer -> debtors" UI)
  const splitSummary = useMemo(() => {
    if (transactionType !== "expense" || !isValidAmount()) {
      return null;
    }

    const totalAmount = parseFloat(amount) || 0;
    const totalInt = Math.ceil(totalAmount);
    if (totalAmount <= 0) return null;

    const payer = expensePayerOptions.find((p) => p.id === payerId);
    if (!payer) return null;

    const effectiveSplitWithIds = getEffectiveSplitWithIds();
    const otherParticipants = effectiveSplitWithIds.filter((id) => id !== payerId);
    const hasOtherParticipants = otherParticipants.length > 0;

    // Don't show if no public expense AND only payer is selected
    if (!isPublicExpense && !hasOtherParticipants) {
      return null;
    }

    type Debtor = {
      id: string;
      name: string;
      avatar?: string;
      amount: number;
      publicShare?: number;
      personalShare?: number;
    };

    const debtors: Debtor[] = [];

    if (isPublicExpense) {
      const memberCount = Math.max(1, participants.length || 1);
      const rawPublicAmount =
        publicAmount && parseFloat(publicAmount) > 0 ? parseFloat(publicAmount) : totalInt / memberCount;
      const finalPublicAmount = Math.ceil(Math.max(0, Math.min(rawPublicAmount, totalInt)));

      const remainingAmount = totalInt - finalPublicAmount;

      // Public Share participants:
      // - If none selected: ALL members share (includes payer if payer is a member)
      // - If selected: ONLY selected participants share (do NOT force-include payer)
      const defaultPublicShareIds = participants.map((p) => p.id);
      const basePublicShareIds =
        publicShareParticipantIds.length > 0 ? publicShareParticipantIds : defaultPublicShareIds;
      const publicShareParticipants = Array.from(new Set(basePublicShareIds));
      const publicShareCount = publicShareParticipants.length;
      if (publicShareCount === 0) return null;

      // Public share: everyone rounds up; extra belongs to payer (reduces payer's debt).
      const publicSharePerPerson = Math.ceil(finalPublicAmount / publicShareCount);
      
      // Calculate total public share after rounding up
      const totalPublicShareRounded = publicSharePerPerson * publicShareCount;
      // Calculate the excess from rounding (this should reduce payer's share)
      const publicShareExcess = totalPublicShareRounded - finalPublicAmount;

      // Personal Share: Split among Split with participants (empty => payer-only)
      const personalShareParticipants = effectiveSplitWithIds.length > 0 ? effectiveSplitWithIds : payerId ? [payerId] : [];
      const personalShares = computeCustomSplits(remainingAmount, personalShareParticipants);
      if (!personalShares.ok) return null;

      const allDebtorIds = Array.from(new Set([...effectiveSplitWithIds, ...basePublicShareIds])).filter(
        (id) => id !== payerId
      );

      allDebtorIds.forEach((participantId) => {
        const participant = participants.find((p) => p.id === participantId);
        if (!participant) return;

        const isInPublicShare = publicShareParticipants.includes(participantId);
        const publicShare = isInPublicShare ? publicSharePerPerson : 0;
        const isPersonalShare = personalShareParticipants.includes(participantId);
        const personalShare = isPersonalShare ? (personalShares.amounts[participantId] || 0) : 0;
        const totalDebt = Math.ceil(publicShare + personalShare);

        if (totalDebt > 0) {
          debtors.push({
            id: participantId,
            name: participant.name,
            avatar: participant.avatar,
            amount: totalDebt,
            publicShare: Math.ceil(publicShare),
            personalShare: Math.ceil(personalShare),
          });
        }
      });
      
      // Calculate payer's share (reduced by excess from rounding)
      const isPayerInPublicShare = publicShareParticipants.includes(payerId);
      let payerAmount = 0;
      if (isPayerInPublicShare) {
        const payerPublicShare = Math.max(0, publicSharePerPerson - publicShareExcess);
        const isPayerPersonalShare = personalShareParticipants.includes(payerId);
        const payerPersonalShare = isPayerPersonalShare ? (personalShares.amounts[payerId] || 0) : 0;
        payerAmount = Math.ceil(payerPublicShare + payerPersonalShare);
      }
      
      const totalAmountToCollect = debtors.reduce((sum, d) => sum + d.amount, 0);
      const payerOutOfPocket = Math.max(0, totalInt - totalAmountToCollect - payerAmount);

      return {
        payer: {
          id: payer.id,
          name: payer.name,
          avatar: payer.avatar,
          amount: payerAmount > 0 ? payerAmount : Math.ceil(payerOutOfPocket),
        },
        debtors,
      };
    } else {
      // Regular expense (no public expense)
      const custom = computeCustomSplits(totalInt, effectiveSplitWithIds);
      if (!custom.ok) return null;
      otherParticipants.forEach((participantId) => {
        const participant = participants.find((p) => p.id === participantId);
        if (!participant) return;
        debtors.push({
          id: participantId,
          name: participant.name,
          avatar: participant.avatar,
          amount: Math.ceil(custom.amounts[participantId] || 0),
        });
      });
    }

    const totalAmountToCollect = debtors.reduce((sum, d) => sum + d.amount, 0);
    const payerOutOfPocket = Math.max(0, totalInt - totalAmountToCollect);

    return {
      payer: {
        id: payer.id,
        name: payer.name,
        avatar: payer.avatar,
        amount: Math.ceil(payerOutOfPocket),
      },
      debtors,
    };
  }, [transactionType, isPublicExpense, amount, publicAmount, selectedParticipantIds, publicShareParticipantIds, payerId, participants, isValidAmount, computeCustomSplits, getEffectiveSplitWithIds]);


  const handleSave = async () => {
    // Prevent double-clicking
    if (saving) {
      return;
    }

    // RBAC: Final guard - prevent Viewer from saving transactions (check URL parameter)
    const roleFromUrl = searchParams.get('role') as 'Owner' | 'Member' | 'Viewer' | null;
    if (roleFromUrl === 'Viewer') {
      handleError(null, "Viewer 角色無法記帳");
      router.replace('/');
      return;
    }

    // Validation: Check amount
    if (!isValidAmount()) {
      handleError(null, "請輸入有效金額");
      return;
    }
    
    // Validation: Check category
    if (!selectedCategory) {
      handleError(null, "請選擇類別");
      return;
    }

    // Validation: For repayment (only in income mode), must select repayment participants
    // This check will be done again in handleSave after querying category name
    // We skip async check here and handle it in handleSave

    // Validation: Check activeLedger
    if (!activeLedger || !activeLedger.id) {
      handleError(null, "請先選擇帳本");
      return;
    }

    if (transactionType === "expense" && !payerId) {
      handleError(null, "請選擇付款人");
      return;
    }

    // Get user if not already loaded
    if (!user) {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);
    }

    // Validation: Check if user is still a member before saving
    let isMember = false;
    if (activeLedger.type === 'ledger') {
      const { data, error } = await supabase
        .from('ledger_members')
        .select('user_id')
        .eq('ledger_id', activeLedger.id)
        .eq('user_id', user?.id)
        .single();
      isMember = !error && !!data;
    } else {
      const { data, error } = await supabase
        .from('book_members')
        .select('user_id')
        .eq('book_id', activeLedger.id)
        .eq('user_id', user?.id)
        .single();
      isMember = !error && !!data;
    }

    if (!isMember) {
      handleError(null, "you are no longer a member of this book, cannot record");
      // Refresh ledgers and redirect
      await refreshLedgers();
      setTimeout(() => {
        // Get fresh ledgers after refresh
        const freshLedgers = ledgers;
        if (freshLedgers.length > 0 && !isViewer && (role === 'Owner' || role === 'Member')) {
          const firstLedger = freshLedgers.find(l => l.id);
          if (firstLedger) {
            setActiveLedger(firstLedger);
          }
        } else {
          router.push('/');
        }
      }, 1000);
      return;
    }

    setSaving(true);

    try {
      const finalAmount = parseFloat(amount);

      const ledgerId = activeLedger.id;
      const ledgerType = activeLedger.type;

    const totalAmount = finalAmount;
      const totalInt = Math.ceil(totalAmount);

    if (transactionType === "income") {
      // Income mode: Check if repayment category is selected (check by category name)
      let isRepaymentCategory = false;
      if (selectedCategory) {
        const { data: category } = await supabase
          .from('categories')
          .select('name')
          .eq('id', selectedCategory)
          .maybeSingle();
        
        if (category?.name === 'To receive from') {
          isRepaymentCategory = true;
        }
      }

      if (isRepaymentCategory) {
        // Repayment category: Write to settlements table only (not transactions)
        if (repaymentParticipantIds.length === 0) {
          handleError(null, "please select repayment participants");
          setSaving(false);
          return;
        }

        const settlementRecords = repaymentParticipantIds.map((participantId) => {
          const settlementData: any = {
            sender_id: participantId,
            receiver_id: user.id,
            amount: Math.round((totalAmount / repaymentParticipantIds.length) * 100) / 100,
            note: note?.trim() || null,
            date: selectedDate.toISOString(),
          };

          // Include ledger_id (don't set book_id)
          settlementData.ledger_id = ledgerId;

          return settlementData;
        });

        console.log('Creating settlements:', settlementRecords);

        const { error: settlementError } = await supabase
          .from("settlements")
          .insert(settlementRecords);

        if (settlementError) {
          handleError(settlementError, 'save settlement failed');
          setSaving(false);
          return;
        }

        // Success: Refresh ledgers and navigate back
        await refreshLedgers();
        // Invalidate caches so Home/Transactions auto-refresh
        await queryClient.invalidateQueries({ queryKey: ['transactions'], exact: false });
        await queryClient.invalidateQueries({ queryKey: ['settlements'], exact: false });
        await queryClient.invalidateQueries({ queryKey: ['ledgerBalance'], exact: false });
        await queryClient.invalidateQueries({ queryKey: ['outstandingTotal'], exact: false });
        router.push("/");
        return;
      } else {
        // Income: personal vs common fund deposit vs bonus/refund
        const categoryId: string | null = selectedCategory;

        if (incomeMode === 'deposit') {
          if (!isMultiMemberLedger) {
            handleError(null, 'this book has no other members, cannot use deposit')
            setSaving(false)
            return
          }
          if (!depositManagerId) {
            handleError(null, "please select manager/receiver");
            setSaving(false);
            return;
          }
          if (depositParticipantIds.length === 0) {
            handleError(null, "please select contributors");
            setSaving(false);
            return;
          }

          const computed = computeCustomSplits(totalInt, depositParticipantIds, depositSplitAmounts);
          if (!computed.ok) {
            handleError(null, "split amount cannot exceed total amount");
            setSaving(false);
            return;
          }
          const splitSum = depositParticipantIds.reduce((sum, id) => sum + (computed.amounts[id] || 0), 0);
          
          // 檢查分攤金額是否足夠（進位後可能會多一點，但不能少）
          if (Math.ceil(splitSum) < totalInt) {
            handleError(null, `split amount total (${Math.ceil(splitSum)}) is less than input total (${totalInt})`);
            setSaving(false);
            return;
          }
          
          const incomeAmount = Math.ceil(splitSum);

          const transactionData: any = {
            payer_id: depositManagerId,
            amount: incomeAmount,
            type: "income",
            income_mode: incomeMode,
            category_id: categoryId,
            description: note?.trim() || null,
            date: toLocalDateString(selectedDate),
            split_with_ids: depositParticipantIds,
            split_with_amounts: (() => {
              const obj: Record<string, number> = {};
              depositParticipantIds.forEach((id) => {
                obj[id] = Math.ceil(computed.amounts[id] || 0);
              });
              return obj;
            })(),
            is_public_expense: false,
            public_amount: null,
            public_share_participant_ids: null,
          };

          if (activeLedger.type === 'ledger') {
            transactionData.ledger_id = activeLedger.id;
          } else {
            transactionData.book_id = activeLedger.id;
          }

          const { data: transaction, error: txError } = await supabase
            .from("transactions")
            .insert(transactionData)
            .select()
            .single();

          if (txError || !transaction) {
            handleError(txError, 'save transaction failed');
            setSaving(false);
            return;
          }

          const splitRecords = depositParticipantIds.map((id) => {
            const splitData: any = {
              transaction_id: transaction.id,
              user_id: id,
              amount: Math.ceil(computed.amounts[id] || 0),
            };
            if (activeLedger.type === 'ledger') splitData.ledger_id = activeLedger.id;
            else splitData.book_id = activeLedger.id;
            return splitData;
          });

          const { error: splitError } = await supabase.from("transaction_splits").insert(splitRecords);
          if (splitError) {
            // 如果 splits 創建失敗，刪除已創建的 transaction 以保持數據一致性
            await supabase
              .from("transactions")
              .delete()
              .eq('id', transaction.id);
            handleError(splitError, 'save split failed, transaction cancelled');
            setSaving(false);
            return;
          }

          await refreshLedgers();
          await queryClient.invalidateQueries({ queryKey: ['transactions'], exact: false });
          await queryClient.invalidateQueries({ queryKey: ['ledgerBalance'], exact: false });
          await queryClient.invalidateQueries({ queryKey: ['outstandingTotal'], exact: false });
          router.push("/");
          return;
        }

        // Personal income
        const transactionData: any = {
          payer_id: user.id,
          amount: totalInt,
          type: "income",
          income_mode: 'personal',
          category_id: categoryId,
          description: note?.trim() || null,
          date: toLocalDateString(selectedDate),
        };

        if (activeLedger.type === 'ledger') transactionData.ledger_id = activeLedger.id;
        else transactionData.book_id = activeLedger.id;

        const { data: transaction, error: txError } = await supabase
          .from("transactions")
          .insert(transactionData)
          .select()
          .single();

        if (txError || !transaction) {
          handleError(txError, 'save transaction failed');
          setSaving(false);
          return;
        }

        // Add split record for personal income so it shows in user balance
        const { error: splitError } = await supabase
          .from("transaction_splits")
          .insert({
            transaction_id: transaction.id,
            ledger_id: activeLedger.type === 'ledger' ? activeLedger.id : null,
            book_id: activeLedger.type === 'account_book' ? activeLedger.id : null,
            user_id: user.id,
            amount: totalInt,
          });

        if (splitError) {
          // 如果 split 創建失敗，刪除已創建的 transaction 以保持數據一致性
          await supabase
            .from("transactions")
            .delete()
            .eq('id', transaction.id);
          handleError(splitError, 'save split failed, transaction cancelled');
          setSaving(false);
          return;
        }

        await refreshLedgers();
        queryClient.invalidateQueries({ queryKey: ['transactions', activeLedger.id, activeLedger.type], exact: false });
        queryClient.invalidateQueries({ queryKey: ['ledgerBalance', activeLedger.id, activeLedger.type], exact: false });
        router.push("/");
        return;
      }
    } else {
      if (payerId === DEPOSIT_PAYER_ID && !isMultiMemberLedger) {
        handleError(null, 'this book has no other members, cannot use deposit')
        setSaving(false)
        return
      }
      if (payerId === DEPOSIT_PAYER_ID) {
        const scopeColumn = ledgerType === 'ledger' ? 'ledger_id' : 'book_id'
        const [incomeResult, expenseResult] = await Promise.all([
          supabase
            .from('transactions')
            .select('amount')
            .eq(scopeColumn, ledgerId)
            .eq('type', 'income')
            .eq('income_mode', 'deposit'),
          supabase
            .from('transactions')
            .select('amount')
            .eq(scopeColumn, ledgerId)
            .eq('type', 'expense')
            .eq('expense_payment_source', 'deposit'),
        ])

        if (incomeResult.error || expenseResult.error) {
          handleError(incomeResult.error || expenseResult.error, 'cannot get deposit balance')
          setSaving(false)
          return
        }

        const depositIncome = incomeResult.data?.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0) || 0
        const depositExpense = expenseResult.data?.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0) || 0
        const depositBalance = depositIncome - depositExpense

        if (totalInt > depositBalance) {
          handleError(null, 'deposit balance is not enough, cannot save')
          setSaving(false)
          return
        }
      }

      // Expense mode: Write to transactions table
      // Category ID is already from database, use it directly
      const categoryId: string | null = selectedCategory;
      const effectiveSplitWithIds = getEffectiveSplitWithIds();
      const selectedCount = effectiveSplitWithIds.length;
      let splits: Array<{ user_id: string; amount: number }> = [];

      if (isPublicExpense) {
        // Public amount: default = Total ÷ member count (can be manually changed)
        const memberCount = Math.max(1, participants.length || 1);
        const defaultPublicAmount = totalInt / memberCount;
        const finalPublicAmount = publicAmount && parseFloat(publicAmount) > 0 
          ? parseFloat(publicAmount) 
          : defaultPublicAmount;

        if (!publicAmount || isNaN(parseFloat(publicAmount)) || parseFloat(publicAmount) <= 0) {
          handleError(null, "請輸入公費金額");
          setSaving(false);
          return;
        }

        const publicInt = Math.ceil(finalPublicAmount);
        if (publicInt > totalInt) {
          handleError(null, "公費不可超過總金額");
          setSaving(false);
          return;
        }
        
        const remainingAmount = totalInt - publicInt;

        // Public Share ($P): Split among public share participants
        // Default: if none selected, ALL members share (even if not split-with/payer)
        // If selected: ONLY selected participants share (do NOT force-include payer)
        const basePublicShareIds =
          publicShareParticipantIds.length > 0 ? publicShareParticipantIds : participants.map((p) => p.id);
        const publicShareParticipants = [...new Set(basePublicShareIds)];
        const publicShareCount = publicShareParticipants.length;
        
        if (publicShareCount === 0) {
          handleError(null, "請選擇公費分攤對象");
          setSaving(false);
          return;
        }
        
        // Public share: everyone rounds up; extra belongs to payer.
        const publicSharePerPerson = Math.ceil(publicInt / publicShareCount);
        
        // Personal Share ($R): Split among Split with participants (empty => payer-only), allow custom amounts
        const personalShareParticipants = effectiveSplitWithIds;
        const personalShares = computeCustomSplits(remainingAmount, personalShareParticipants);
        if (!personalShares.ok) {
          handleError(null, "分攤金額不可超過總金額");
          setSaving(false);
          return;
        }
        
        // Calculate each participant's debt
        // Debtors should include EVERYONE who has either a personal share or a public share
        const allPotentialDebtorIds = [...new Set([...effectiveSplitWithIds, ...basePublicShareIds])];
        
        // Calculate total public share after rounding up
        const totalPublicShareRounded = publicSharePerPerson * publicShareCount;
        // Calculate the excess from rounding (this should reduce payer's share)
        const publicShareExcess = totalPublicShareRounded - publicInt;
        
        const effectivePayerId = payerId === DEPOSIT_PAYER_ID ? null : (payerId || user.id);
        
        allPotentialDebtorIds.forEach((participantId) => {
          // Check if this participant is in public share participants
          const isInPublicShare = publicShareParticipants.includes(participantId);
          const publicShare = isInPublicShare ? publicSharePerPerson : 0;
          
          // Personal share: only users share (if this participant is in effectiveSplitWithIds)
          const isPersonalShare = personalShareParticipants.includes(participantId);
          const personalShare = isPersonalShare ? (personalShares.amounts[participantId] || 0) : 0;
          
          let totalDebt = Math.ceil(publicShare + personalShare);
          
          // If this is the payer and there's excess from rounding, reduce their debt
          if (participantId === effectivePayerId && publicShareExcess > 0 && isInPublicShare) {
            totalDebt = Math.max(0, totalDebt - publicShareExcess);
          }
          
          if (totalDebt > 0) {
          splits.push({
            user_id: participantId,
            amount: totalDebt,
          });
          }
        });
      } else {
        const custom = computeCustomSplits(totalInt, effectiveSplitWithIds);
        if (!custom.ok) {
          handleError(null, "分攤金額不可超過總金額");
          setSaving(false);
          return;
        }
        effectiveSplitWithIds.forEach((participantId) => {
          splits.push({
            user_id: participantId,
            amount: Math.ceil(custom.amounts[participantId] || 0),
          });
        });
      }

      const transactionData: any = {
        payer_id: payerId === DEPOSIT_PAYER_ID ? null : (payerId || user.id),
        amount: totalInt,
        type: "expense",
        category_id: categoryId,
        description: note?.trim() || null,
        // Save as local date-only string to avoid timezone shifting (off-by-one day)
        date: toLocalDateString(selectedDate),
        expense_payment_source: payerId === DEPOSIT_PAYER_ID ? 'deposit' : 'personal',
      };

      // Persist split/shared-expense UI state so /edit can restore exactly
      transactionData.split_with_ids = selectedParticipantIds || [];
      const splitWithAmounts: Record<string, number> = {};
      (selectedParticipantIds || []).forEach((id) => {
        const v = customSplitAmounts[id];
        const n = Number(v);
        if (v !== undefined && v !== "" && !isNaN(n) && n >= 0) {
          splitWithAmounts[id] = Math.ceil(n);
        }
      });
      transactionData.split_with_amounts = Object.keys(splitWithAmounts).length > 0 ? splitWithAmounts : null;
      transactionData.is_public_expense = !!isPublicExpense;
      if (isPublicExpense) {
        const p = parseFloat(publicAmount);
        transactionData.public_amount = !isNaN(p) ? Math.ceil(p) : null;
        transactionData.public_share_participant_ids =
          publicShareParticipantIds.length > 0 ? publicShareParticipantIds : null;
      } else {
        transactionData.public_amount = null;
        transactionData.public_share_participant_ids = null;
      }
      
      console.log('Saving expense transaction with category_id:', categoryId, 'description:', note);

      // RLS: transactions uses ledger_id for ledgers and book_id for account_books
      if (activeLedger.type === 'ledger') {
        transactionData.ledger_id = ledgerId;
      } else {
        transactionData.book_id = ledgerId;
      }

      console.log('Creating expense transaction:', transactionData);

      const { data: transaction, error: txError } = await supabase
        .from("transactions")
        .insert(transactionData)
        .select()
        .single();

      if (txError || !transaction) {
        console.error("Error creating transaction:", txError);
        handleError(txError, `save failed: ${txError?.message || 'Unknown error'}`);
        setSaving(false);
        return;
      }

      const splitRecords = splits.map((split) => {
        const splitData: any = {
          transaction_id: transaction.id,
          user_id: split.user_id,
          amount: split.amount,
        };

        // RLS/Schema: transaction_splits uses ledger_id for ledgers and book_id for account_books
        if (activeLedger.type === 'ledger') {
          splitData.ledger_id = ledgerId;
        } else {
          splitData.book_id = ledgerId;
        }

        return splitData;
      });

      console.log('Creating transaction splits:', splitRecords);

      // 只有在有 splits 時才插入，如果 splits 為空（例如只有付款人沒有分攤對象），transaction 仍然有效
      if (splitRecords.length > 0) {
      const { error: splitError } = await supabase
        .from("transaction_splits")
        .insert(splitRecords);

      if (splitError) {
          // 如果 splits 創建失敗，刪除已創建的 transaction 以保持數據一致性
          await supabase
            .from("transactions")
            .delete()
            .eq('id', transaction.id);
          handleError(splitError, 'save split failed, transaction cancelled');
        setSaving(false);
        return;
        }
      }

      // Success: Refresh ledgers and navigate back
      await refreshLedgers();
      // Invalidate caches so Home/Transactions auto-refresh
      await queryClient.invalidateQueries({ queryKey: ['transactions'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['ledgerBalance'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['outstandingTotal'], exact: false });
      router.push("/");
    }
    } catch (error: any) {
      handleError(error, 'save failed');
    } finally {
      setSaving(false);
    }
  };

  // Validation logic for save button
  const canSave = () => {
    // Must have valid amount
    if (!isValidAmount()) {
      return false;
    }

    // Must have selected category
    if (!selectedCategory) {
      return false;
    }

    // Must have active ledger
    if (!activeLedger || !activeLedger.id) {
      return false;
    }

    if (transactionType === "expense" && !payerId) {
      return false;
    }

    // Split with is optional (empty means payer-only)

    // For "To receive from" category (only in income mode), must have repayment participants and valid amount
    if (transactionType === "income" && selectedCategoryName === 'To receive from') {
      if (repaymentParticipantIds.length === 0) {
        return false;
      }
      // Amount validation is already checked above
    }

    if (transactionType === "income" && selectedCategoryName !== 'To receive from') {
      if (incomeMode === 'deposit' && !isMultiMemberLedger) {
        return false
      }
      if ((incomeMode === 'deposit' || incomeMode === 'bonus') && depositParticipantIds.length === 0) {
        return false;
      }
      if ((incomeMode === 'deposit' || incomeMode === 'bonus') && !depositManagerId) {
        return false;
      }
    }

    if (transactionType === "expense" && isPublicExpense) {
      const total = parseFloat(amount) || 0;
      const p = parseFloat(publicAmount);
      if (!publicAmount || isNaN(p) || p <= 0) {
        return false;
      }
      if (total > 0 && !isNaN(p) && p > total) {
        return false;
      }
    }

    // For general income (not "To receive from"), no participants required
    return true;
  };

  // ========== CONDITIONAL RENDERING (AFTER ALL HOOKS) ==========
  // Show loading spinner while user is loading
  if (isLoadingUserFromHook) {
    return <Loading fullScreen message="Loading..." />;
  }

  // Check if user is logged in - redirect to login if not
  if (!userFromHook && !isLoadingUserFromHook) {
    router.push('/login');
    return <Loading fullScreen message="Redirecting to login..." />;
  }

  // Check if user has access to the ledger - redirect to home if not
  const roleFromUrl = searchParams.get('role') as 'Owner' | 'Member' | 'Viewer' | null;
  const ledgerIdFromUrl = searchParams.get('ledger_id');
  const bookIdFromUrl = searchParams.get('book_id');

  // Check role from URL parameter - if Viewer, show permission denied UI
  if (roleFromUrl === 'Viewer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light">
        <div className="text-center px-6">
          <div className="mb-6">
            <div className="flex items-center justify-center size-20 rounded-full bg-red-50 mx-auto mb-4">
              <span className="material-symbols-outlined text-red-500" style={{ fontSize: "48px" }}>
                block
              </span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No permission to record</h2>
            <p className="text-gray-500 mb-8">You only have view permission, cannot perform recording operations</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="w-full max-w-xs mx-auto h-14 bg-primary hover:bg-primary/90 rounded-full text-white font-bold text-lg shadow-lg shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>arrow_back</span>
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ErrorToast
        message={error?.message || ''}
        isVisible={isErrorVisible}
        onClose={clearError}
        details={error?.details}
      />
    <div className="fixed inset-0 bg-background-light" style={{ height: '100dvh', minHeight: '100vh', overflow: 'hidden' }} data-nextjs-scroll-focus-boundary>
      <div className="relative flex h-full w-full flex-col max-w-md mx-auto bg-background-light shadow-2xl overflow-y-auto overflow-x-hidden" style={{ height: '100%', maxHeight: '100dvh', WebkitOverflowScrolling: 'touch' as any }}>
      <div className="flex flex-col px-6 pt-8 pb-2 shrink-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              if (isDirectAccess) {
                // 直接進入，回到首頁
                router.push('/');
              } else {
                // 從其他頁面進入，返回上一頁
                router.back();
              }
            }}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/50 hover:bg-white transition-all duration-200"
          >
            <X className="w-6 h-6 text-[#657486] dark:text-gray-400" />
          </button>
          <div className="w-full flex justify-center">
            <div className="bg-white p-1 rounded-full border border-gray-100 flex relative w-64 shadow-sm">
              <button
                onClick={() => setTransactionType("expense")}
                className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${
                  transactionType === "expense"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                Expense
              </button>
              <button
                onClick={() => setTransactionType("income")}
                className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${
                  transactionType === "income"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                Income
              </button>
            </div>
          </div>
          <div className="size-10"></div>
        </div>
        {/* Ledger Dropdown - only show if not Viewer */}
        {!isViewer && (
          <div className="flex items-center justify-center">
            <LedgerDropdown 
              className="max-w-xs" 
              onSelect={handleLedgerChange}
            />
          </div>
        )}
      </div>

      <div
        className="flex-1 flex flex-col w-full overflow-y-auto no-scrollbar relative z-10 pb-32"
        style={{ WebkitOverflowScrolling: 'touch' as any }}
        onClick={() => {
          setShowKeypad(false);
          setEditingAmountType(null);
          setEditingAmountId(null);
        }}
      >
        <div className="flex flex-col items-center justify-center pt-10 px-4">
          <div className="flex flex-col items-center max-w-[320px]">
            <h1
              onClick={(e) => {
                e.stopPropagation();
                setShouldResetAmount(true);
                setShowKeypad(true);
              }}
              className={`tracking-tighter font-extrabold flex items-start justify-center gap-1 cursor-pointer text-center break-all whitespace-pre-wrap ${
                transactionType === "expense" ? "text-gray-500" : "text-primary"
              } ${
                amount.length > 12 ? 'text-3xl' : amount.length > 8 ? 'text-4xl' : amount.length > 5 ? 'text-5xl' : 'text-[64px]'
              }`}
            >
              <span className="text-3xl mt-2 font-bold">$</span>
              <span>{formatAmountString(amount)}</span>
            </h1>
          </div>
        </div>

        {/* Payer and Debtors - match /edit UI */}
        {transactionType === "expense" && splitSummary && splitSummary.debtors.length > 0 && payerId !== DEPOSIT_PAYER_ID && (
          <div className="mt-6 mb-8 flex items-center justify-center gap-4 text-sm font-medium px-6 w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-1">
              <span className="text-text-muted text-xs">Payer</span>
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs overflow-hidden">
                  {splitSummary.payer.avatar ? (
                    <img alt={splitSummary.payer.name} src={splitSummary.payer.avatar} className="w-full h-full object-cover" />
                  ) : (
                    <span>{splitSummary.payer.name[0]}</span>
                  )}
                </div>
                <span className="text-text-main">${splitSummary.payer.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            <span className="material-symbols-outlined text-text-muted/50 mt-4">arrow_back</span>

            <div className="flex flex-col items-center gap-1">
              <span className="text-text-muted text-xs">Debtors</span>
              <div className="flex flex-col gap-1">
                {splitSummary.debtors.map((debtor) => (
                  <div
                    key={debtor.id}
                    className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100"
                  >
                    <div className="h-6 w-6 rounded-full bg-primary-light flex items-center justify-center text-white text-[10px] font-bold overflow-hidden">
                      {debtor.avatar ? (
                        <img alt={debtor.name} src={debtor.avatar} className="w-full h-full object-cover" />
                      ) : (
                        <span>{debtor.name[0]}</span>
                      )}
                    </div>
                    <span className="text-text-main font-semibold">${debtor.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* More detailed breakdown for shared expense (keep spacing tidy, style aligned with /edit chips) */}
        {transactionType === "expense" && splitSummary && isPublicExpense && splitSummary.debtors.length > 0 && payerId !== DEPOSIT_PAYER_ID && (
          <div className="px-6 w-full mt-4 mb-6" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Detailed Split Details
              </div>
              <div className="flex flex-col gap-2">
                {splitSummary.debtors.map((debtor) => (
                  <div
                    key={`detail-${debtor.id}`}
                    className="w-full flex items-center justify-between gap-3 bg-white px-3 py-2 rounded-full shadow-sm border border-gray-100"
                  >
                    <span className="text-xs font-semibold text-text-main truncate">
                      {debtor.name}
                    </span>
                    <span className="text-[11px] text-text-muted whitespace-nowrap">
                      Public Share {((debtor.publicShare || 0).toFixed(0))} + Personal {((debtor.personalShare || 0).toFixed(0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowKeypad(false);
          }}
        >
          <CategoryPicker
            selectedCategory={selectedCategory}
            onSelectCategory={(category: string) => {
              setSelectedCategory(category);
              setShowKeypad(false);
            }}
            onModalStateChange={setShowCreateCategoryModal}
            type={transactionType}
          />
        </div>

        {/* Income mode (personal vs common fund deposit vs bonus/refund) */}
        {transactionType === "income" && selectedCategoryName !== 'To receive from' && (
          <div className="px-6 w-full mb-6" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-transparent hover:border-primary/10 transition-colors">
              <div className="w-full flex justify-center mb-4">
                <div className="bg-background-light p-1 rounded-full border border-gray-100 flex relative w-full max-w-[320px] shadow-sm">
                  <button
                    onClick={() => setIncomeMode('personal')}
                    className={`flex-1 py-2 rounded-full text-xs font-bold transition-all ${
                      incomeMode === 'personal' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'
                    }`}
                  >
                     Personal Income
                  </button>
                  {isMultiMemberLedger && (
                    <button
                      onClick={() => setIncomeMode('deposit')}
                      className={`flex-1 py-2 rounded-full text-xs font-bold transition-all ${
                        incomeMode === 'deposit' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'
                      }`}
                    >
                        Deposit
                    </button>
                  )}
                </div>
              </div>

              {incomeMode === 'deposit' && isMultiMemberLedger && (
                <>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowKeypad(false);
                      setPayerModalMode('deposit');
                      setTimeout(() => setShowPayerModal(true), 100);
                    }}
                    className="flex items-center justify-between mb-5 border-b border-gray-100 pb-5 cursor-pointer"
                  >
                    <span className="text-sm font-bold text-[#657486] tracking-wide">
                    Manager/Receiver
                    </span>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const p = participants.find((x) => x.id === depositManagerId);
                        if (!p) return null;
                        return (
                          <div className="relative z-30 size-10 rounded-full border-2 border-white ring-2 ring-primary overflow-hidden">
                            {p.avatar ? (
                              <img alt={p.name} src={p.avatar} className="rounded-full size-full object-cover" />
                            ) : (
                              <div className="rounded-full size-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                                {p.name[0]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <span className="material-symbols-outlined text-primary">edit</span>
                    </div>
                  </div>

                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowKeypad(false);
                      setParticipantsModalMode('deposit');
                      setTimeout(() => setShowParticipantsModal(true), 100);
                    }}
                    className="flex items-center justify-between mb-5 border-b border-gray-100 pb-5 cursor-pointer"
                  >
                    <span className="text-sm font-bold text-[#657486] tracking-wide">
                    Contributors
                    </span>
                    <div className="flex -space-x-2">
                      {depositParticipantIds.map((id, index) => {
                        const participant = participants.find((p) => p.id === id);
                        if (!participant) return null;
                        return (
                          <button
                            key={id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowKeypad(false);
                              setParticipantsModalMode('deposit');
                              setTimeout(() => setShowParticipantsModal(true), 100);
                            }}
                            className="relative z-30 size-10 rounded-full border-2 border-white ring-2 ring-primary transition-transform hover:scale-105 active:scale-95 overflow-hidden"
                            style={{ zIndex: 30 - index }}
                          >
                            {participant.avatar ? (
                              <img alt={participant.name} src={participant.avatar} className="rounded-full size-full object-cover" />
                            ) : (
                              <div className="rounded-full size-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                                {participant.name[0]}
                              </div>
                            )}
                          </button>
                        );
                      })}
                      {participants.filter((p) => !depositParticipantIds.includes(p.id)).length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowKeypad(false);
                            setParticipantsModalMode('deposit');
                            setTimeout(() => setShowParticipantsModal(true), 100);
                          }}
                          className="relative z-0 size-10 rounded-full border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary hover:bg-blue-50 transition-all"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {depositParticipantIds.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                        Amounts (Optional)
                      </div>
                      <div className="flex flex-col gap-2">
                        {depositParticipantIds.map((id) => {
                          const p = participants.find((x) => x.id === id);
                          if (!p) return null;
                          return (
                            <div key={`income-split-amt-${id}`} className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-9 w-9 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                                  {p.avatar ? (
                                    <img alt={p.name} src={p.avatar} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs font-bold text-text-muted">{p.name[0]}</span>
                                  )}
                                </div>
                                <div className="text-sm font-semibold text-text-main truncate">{p.name}</div>
                              </div>
                              <input
                                ref={editingAmountType === 'depositSplit' && editingAmountId === id ? editingInputRef : null}
                                type="number"
                                inputMode="numeric"
                                value={depositSplitAmounts[id] ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDepositSplitAmounts((prev) => ({ ...prev, [id]: v }));
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAmountType('depositSplit');
                                  setEditingAmountId(id);
                                  setShowKeypad(true);
                                }}
                                placeholder="Auto"
                                className="w-28 bg-background-light rounded-xl border-none py-2 px-3 text-text-main font-semibold text-right focus:ring-2 focus:ring-primary/20 placeholder-text-muted/50 transition-shadow cursor-pointer"
                                readOnly
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Shared With - Only for Expense */}
        {transactionType === "expense" && (
          <div className="px-6 w-full mb-6" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-transparent hover:border-primary/10 transition-colors">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowKeypad(false);
                  setPayerModalMode('expense');
                  setTimeout(() => {
                    setShowPayerModal(true);
                  }, 100);
                }}
                className={`flex items-center justify-between ${payerId !== DEPOSIT_PAYER_ID ? 'mb-5 border-b border-gray-100 pb-5' : ''} cursor-pointer`}
              >
                <span className="text-sm font-bold text-[#657486] tracking-wide">
                  Payer
                </span>
                <div className="flex items-center gap-2">
                  {(() => {
                    const p = expensePayerOptions.find((x) => x.id === payerId);
                    if (!p) return null;
                    return (
                      <div className="relative z-30 size-10 rounded-full border-2 border-white ring-2 ring-primary overflow-hidden">
                        {(p as any).avatar ? (
                          <img alt={p.name} src={p.avatar} className="rounded-full size-full object-cover" />
                        ) : (
                          <div className="rounded-full size-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                            {p.name[0]}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <span className="material-symbols-outlined text-primary">edit</span>
                </div>
              </div>

              {payerId !== DEPOSIT_PAYER_ID && (
                <>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowKeypad(false);
                  setParticipantsModalMode('expense');
                  setTimeout(() => {
                    setShowParticipantsModal(true);
                  }, 100);
                }}
                className="flex items-center justify-between mb-5 border-b border-gray-100 pb-5 cursor-pointer"
              >
                <span className="text-sm font-bold text-[#657486] tracking-wide">
                Split with
                </span>
              <div className="flex -space-x-2">
                {selectedParticipantIds.map((id, index) => {
                  const participant = participants.find((p) => p.id === id);
                  if (!participant) return null;
                  return (
                    <button
                      key={id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowKeypad(false);
                          setParticipantsModalMode('expense');
                        setTimeout(() => {
                          setShowParticipantsModal(true);
                        }, 100);
                      }}
                      className="relative z-30 size-10 rounded-full border-2 border-white ring-2 ring-primary transition-transform hover:scale-105 active:scale-95"
                      style={{ zIndex: 30 - index }}
                    >
                      {participant.avatar ? (
                        <img
                          alt={participant.name}
                          src={participant.avatar}
                          className="rounded-full size-full object-cover"
                        />
                      ) : (
                        <div className="rounded-full size-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                          {participant.name[0]}
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 bg-primary text-white rounded-full p-0.5 border-2 border-white">
                        <svg
                          className="w-2.5 h-2.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </button>
                  );
                })}
                {participants.filter((p) => !selectedParticipantIds.includes(p.id)).length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowKeypad(false);
                      setParticipantsModalMode('expense');
                      setTimeout(() => {
                        setShowParticipantsModal(true);
                      }, 100);
                    }}
                    className="relative z-0 size-10 rounded-full border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary hover:bg-blue-50 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {selectedParticipantIds.length > 0 && (
              <div className="mt-3 mb-4">
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Split Amounts (Optional)
                </div>
                <div className="flex flex-col gap-2">
                  {selectedParticipantIds.map((id) => {
                    const p = participants.find((x) => x.id === id);
                    if (!p) return null;
                    return (
                      <div key={`split-amt-${id}`} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-9 w-9 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                            {p.avatar ? (
                              <img alt={p.name} src={p.avatar} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-text-muted">{p.name[0]}</span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-text-main truncate">{p.name}</div>
                        </div>
                        <input
                          ref={editingAmountType === 'customSplit' && editingAmountId === id ? editingInputRef : null}
                          type="number"
                          inputMode="decimal"
                          value={customSplitAmounts[id] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCustomSplitAmounts((prev) => ({ ...prev, [id]: v }));
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingAmountType('customSplit');
                            setEditingAmountId(id);
                            setShowKeypad(true);
                          }}
                          placeholder="Auto"
                          className="w-28 bg-background-light rounded-xl border-none py-2 px-3 text-text-main font-semibold text-right focus:ring-2 focus:ring-primary/20 placeholder-text-muted/50 transition-shadow cursor-pointer"
                          readOnly
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {isMultiMemberLedger && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">groups</span>
                </div>
                <div>
                  <h4 className="font-semibold text-text-main">Shared expense</h4>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublicExpense}
                  onChange={(e) => setIsPublicExpense(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            )}
            {isPublicExpense && isMultiMemberLedger && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Shared expense Amount ($)
                </label>
                <input
                  ref={editingAmountType === 'publicAmount' ? editingInputRef : null}
                  type="text"
                  inputMode="decimal"
                  value={publicAmount}
                  onChange={(e) => {
                    const next = e.target.value;
                    const total = Math.ceil(parseFloat(amount) || 0);
                    if (next === "") {
                      setPublicAmount("");
                    } else {
                      const n = parseFloat(next);
                      if (isNaN(n)) {
                        if (/^[0-9]*\.?[0-9]*$/.test(next)) {
                        setPublicAmount(next);
                        }
                      } else if (total > 0) {
                        setPublicAmount(next);
                      } else {
                        setPublicAmount(next);
                      }
                    }
                    setPublicAmountManuallySet(true);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingAmountType('publicAmount');
                    setEditingAmountId(null);
                    setShowKeypad(true);
                  }}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setPublicAmount("0");
                    } else {
                      const n = parseFloat(val);
                      if (!isNaN(n)) {
                        const total = Math.ceil(parseFloat(amount) || 0);
                        if (total > 0) {
                          setPublicAmount(Math.min(Math.ceil(n), total).toString());
                        } else {
                          setPublicAmount(Math.ceil(n).toString());
                        }
                      }
                    }
                  }}
                  placeholder="Auto-calculated"
                  className="w-full bg-background-light rounded-xl border-none py-3 px-4 text-text-main font-semibold focus:ring-2 focus:ring-primary/20 placeholder-text-muted/50 transition-shadow cursor-pointer"
                  readOnly
                />
                <p className="text-xs text-text-muted mt-2">
                  Default: ${(() => {
                    const total = parseFloat(amount) || 0
                    const publicShareCount = publicShareParticipantIds.length > 0 
                      ? publicShareParticipantIds.length 
                      : participants.length;
                    const memberCount = Math.max(1, publicShareCount || 1)
                    return Math.ceil(total / memberCount).toFixed(0)
                  })()} (Total ÷ {publicShareParticipantIds.length > 0 ? publicShareParticipantIds.length : participants.length})
                </p>
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Shared with(Shared expense)
                  </label>
                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-3 overflow-hidden p-1">
                      {publicShareParticipantIds.map((id, index) => {
                        const participant = participants.find((p) => p.id === id);
                        if (!participant) return null;
                        return (
                          <div
                            key={id}
                            className={`h-10 w-10 rounded-full ring-2 ring-white overflow-hidden ${
                              id === payerId ? 'bg-primary-light' : 'bg-gray-200'
                            }`}
                            style={{ zIndex: publicShareParticipantIds.length - index }}
                          >
                            {participant.avatar ? (
                              <img
                                alt={participant.name}
                                src={participant.avatar}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center text-xs font-bold ${
                                id === payerId ? 'text-white' : 'text-gray-700'
                              }`}>
                                {participant.name[0]}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowKeypad(false);
                        setTimeout(() => {
                          setShowPublicShareModal(true);
                        }, 100);
                      }}
                      className="text-primary text-sm font-semibold hover:text-primary/80 transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
                  )}
                </>
            )}
          </div>
        </div>
        )}

        {/* Repayment Object - Only for Income when "To receive from" category is selected */}
        {transactionType === "income" && selectedCategoryName === 'To receive from' && (
          <div className="px-6 w-full mb-6" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-transparent hover:border-primary/10 transition-colors">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowKeypad(false);
                  setTimeout(() => {
                    setShowRepaymentModal(true);
                  }, 100);
                }}
                className="flex items-center justify-between cursor-pointer"
              >
                <span className="text-sm font-bold text-[#657486] tracking-wide">
                收到還款
                </span>
                <div className="flex -space-x-2">
                  {repaymentParticipantIds.map((id, index) => {
                    const participant = participants.find((p) => p.id === id);
                    if (!participant) return null;
                    return (
                      <button
                        key={id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowKeypad(false);
                          setTimeout(() => {
                            setShowRepaymentModal(true);
                          }, 100);
                        }}
                        className="relative z-30 size-10 rounded-full border-2 border-white ring-2 ring-primary transition-transform hover:scale-105 active:scale-95"
                        style={{ zIndex: 30 - index }}
                      >
                        {participant.avatar ? (
                          <img
                            alt={participant.name}
                            src={participant.avatar}
                            className="rounded-full size-full object-cover"
                          />
                        ) : (
                          <div className="rounded-full size-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                            {participant.name[0]}
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 bg-primary text-white rounded-full p-0.5 border-2 border-white">
                          <svg
                            className="w-2.5 h-2.5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      </button>
                    );
                  })}
                  {participants.filter((p) => !repaymentParticipantIds.includes(p.id)).length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowKeypad(false);
                        setTimeout(() => {
                          setShowRepaymentModal(true);
                        }, 100);
                      }}
                      className="relative z-0 size-10 rounded-full border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary hover:bg-blue-50 transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 w-full mb-6" onClick={(e) => e.stopPropagation()}>
          <div className="group relative flex items-center w-full bg-white rounded-full shadow-sm px-5 py-4 transition-all duration-300 border-2 border-transparent focus-within:border-primary/30 focus-within:shadow-soft">
            <div className="shrink-0 mr-3 text-primary/60 group-focus-within:text-primary transition-colors">
              <Edit3 className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={transactionType === "income" ? "where did this money come from?" : "where did this money go?"}
                className="bg-transparent border-none outline-none text-[#121417] placeholder:text-gray-400 w-full text-base font-medium focus:ring-0 p-0 m-0 leading-normal"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className={`fixed bottom-0 left-0 right-0 max-w-md mx-auto transition-all duration-300 ease-in-out z-[100] ${
          showKeypad
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <NumericKeypad
          onInput={handleKeypadInput}
          onClear={handleClear}
          onBackspace={handleBackspace}
          onCalculate={handleCalculate}
          onSave={handleConfirmAmount}
          canSave={isValidAmount()}
        />
      </div>

      {!showKeypad && !showCreateCategoryModal && (
        <div 
          className="fixed bottom-0 left-0 right-0 max-w-md mx-auto rounded-t-[32px] p-6 z-50 bg-background-light shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
          style={{ "--tw-shadow": "0 0 0px 0px rgba(0, 0, 0, 0.08)" } as React.CSSProperties}
        >
          <button
            onClick={handleSave}
            disabled={!canSave() || saving}
            className={`w-full py-4 rounded-2xl font-bold text-white transition-all active:scale-95 ${
              canSave() && !saving
                ? "bg-primary hover:bg-primary-dark"
                : "bg-gray-300 cursor-not-allowed"
            }`}
            style={{ "--tw-shadow": "0 0 0px 0px rgba(0, 0, 0, 0.08)" } as React.CSSProperties}
          >
            <div className="flex items-center justify-center gap-2">
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-[3px] border-white/30 border-t-white"></div>
                  <span>saving...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>save</span>
                </>
              )}
            </div>
          </button>
        </div>
      )}

      <SelectParticipants
        isOpen={showParticipantsModal}
        onClose={() => setShowParticipantsModal(false)}
        onConfirm={(ids) => {
          if (participantsModalMode === 'deposit') {
            setDepositParticipantIds(ids);
            setDepositSplitAmounts((prev) => {
              const next: Record<string, string> = {};
              ids.forEach((id) => {
                if (prev[id] !== undefined) next[id] = prev[id];
              });
              return next;
            });
          } else {
            setSelectedParticipantIds(ids);
            setCustomSplitAmounts((prev) => {
              const next: Record<string, string> = {};
              ids.forEach((id) => {
                if (prev[id] !== undefined) next[id] = prev[id];
              });
              return next;
            });
          }
        }}
        participants={participants}
        selectedIds={participantsModalMode === 'deposit' ? depositParticipantIds : selectedParticipantIds}
        payerId={(participantsModalMode === 'deposit' ? depositManagerId : payerId) || null}
        allowEmpty={true}
      />

      {showPayerModal && (
        <SelectParticipants
          isOpen={showPayerModal}
          onClose={() => setShowPayerModal(false)}
          onConfirm={(ids) => {
            const nextId = ids[0] || "";
            if (payerModalMode === 'deposit') {
              setDepositManagerId(nextId);
            } else {
              const prevPayerId = payerId;
              setPayerId(nextId);
              if (prevPayerId) {
                setSelectedParticipantIds((prev) => prev.filter((id) => id !== prevPayerId));
              }
            }
            setShowPayerModal(false);
          }}
          participants={payerModalMode === 'expense' ? expensePayerOptions : participants}
          selectedIds={(payerModalMode === 'deposit' ? depositManagerId : payerId) ? [(payerModalMode === 'deposit' ? depositManagerId : payerId)] : []}
          payerId={(payerModalMode === 'deposit' ? depositManagerId : payerId) || null}
          allowEmpty={false}
          single={true}
        />
      )}

      {showRepaymentModal && (
        <SelectParticipants
          isOpen={showRepaymentModal}
          onClose={() => setShowRepaymentModal(false)}
          onConfirm={(ids) => {
            setRepaymentParticipantIds(ids);
            setShowRepaymentModal(false);
          }}
          participants={participants.filter((p) => p.id !== user?.id)}
          selectedIds={repaymentParticipantIds}
          payerId={null}
          allowEmpty={false}
        />
      )}

      {showDatePicker && (
        <DatePickerModal
          isOpen={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onConfirm={(date) => {
            setSelectedDate(date);
            setShowDatePicker(false);
          }}
          initialDate={selectedDate}
        />
      )}

      {showPublicShareModal && (
        <SelectParticipants
          isOpen={showPublicShareModal}
          onClose={() => setShowPublicShareModal(false)}
          onConfirm={(ids) => {
            setPublicShareParticipantIds(ids);
            setShowPublicShareModal(false);
          }}
          participants={participants}
          selectedIds={publicShareParticipantIds}
          payerId={payerId}
          allowEmpty={true}
        />
      )}
      </div>
    </div>
    </>
  );
}

export default function AddTransactionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AddTransactionPageContent />
    </Suspense>
  );
}

