'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import CategoryPicker from '@/components/CategoryPicker'
import SelectParticipants from '@/components/SelectParticipants'
import DatePickerModal from '@/components/DatePickerModal'
import NumericKeypad from '@/components/NumericKeypad'
import { createClient } from '@/lib/supabase/client'
import { useLedger } from '@/contexts/LedgerContext'
import { useParticipants } from '@/hooks/useParticipants'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole'
import ErrorToast from '@/components/ErrorToast'
import { formatSimpleDate } from '@/utils/date'
import Loading from '@/components/Loading'
import { formatAmountString } from '@/utils/formatAmount'

interface Participant {
  id: string
  name: string
  avatar?: string
  isPayer?: boolean
}

export default function EditTransactionPage() {
  const DEPOSIT_PAYER_ID = '__DEPOSIT__'
  const router = useRouter()
  const params = useParams()
  const transactionId = params.id as string
  const isSettlement = transactionId.startsWith('settlement-')
  const settlementId = isSettlement ? transactionId.replace('settlement-', '') : null
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { activeLedger, refreshLedgers } = useLedger()
  const { role, isViewer, isLoading: isLoadingRole } = useCurrentUserRole()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('0')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [isPublicExpense, setIsPublicExpense] = useState(false)
  const [showParticipantsModal, setShowParticipantsModal] = useState(false)
  const [showPayerModal, setShowPayerModal] = useState(false)
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false)
  const [showKeypad, setShowKeypad] = useState(false)
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [publicShareParticipantIds, setPublicShareParticipantIds] = useState<string[]>([])
  const [payerId, setPayerId] = useState<string>('')
  const [depositManagerId, setDepositManagerId] = useState<string>('')
  const [depositParticipantIds, setDepositParticipantIds] = useState<string[]>([])
  const [depositSplitAmounts, setDepositSplitAmounts] = useState<Record<string, string>>({})
  const [participantsModalMode, setParticipantsModalMode] = useState<'expense' | 'deposit'>('expense')
  const [payerModalMode, setPayerModalMode] = useState<'expense' | 'deposit'>('expense')
  const [incomeMode, setIncomeMode] = useState<'personal' | 'deposit' | 'bonus'>('personal')
  const [publicAmount, setPublicAmount] = useState<string>('')
  const [publicAmountManuallySet, setPublicAmountManuallySet] = useState(false)
  const [shouldResetAmount, setShouldResetAmount] = useState(false)
  const [customSplitAmounts, setCustomSplitAmounts] = useState<Record<string, string>>({})
  const [showPublicShareModal, setShowPublicShareModal] = useState(false)
  const [repaymentParticipantIds, setRepaymentParticipantIds] = useState<string[]>([])
  const [showRepaymentModal, setShowRepaymentModal] = useState(false)
  const [editingAmountType, setEditingAmountType] = useState<'main' | 'depositSplit' | 'customSplit' | 'publicAmount' | null>(null)
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null)
  const editingInputRef = useRef<HTMLInputElement | null>(null)
  const [originalTransaction, setOriginalTransaction] = useState<any>(null)
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null)
  const [originalRepaymentParticipantIds, setOriginalRepaymentParticipantIds] = useState<string[]>([])
  const [settlementSenderId, setSettlementSenderId] = useState<string>('')
  const [settlementReceiverId, setSettlementReceiverId] = useState<string>('')
  const [settlementCreatedAt, setSettlementCreatedAt] = useState<Date | null>(null)

  // Use React Query hook for participants
  // IMPORTANT: pass activeLedger.id for BOTH ledger and account_book
  // useParticipants() will detect which membership table to use.
  const { data: participantsData = [] } = useParticipants(activeLedger?.id || null)
  const participants = participantsData
  const isMultiMemberLedger = participants.length > 1
  const expensePayerOptions = useCallback(() => {
    if (!isMultiMemberLedger) return participants
    const depositOption = { id: DEPOSIT_PAYER_ID, name: 'Deposit' } as any
    return [depositOption, ...participants]
  }, [participants, DEPOSIT_PAYER_ID, isMultiMemberLedger])

  // Use unified error handler
  const { error, isErrorVisible, handleError, clearError } = useErrorHandler()

  // Load transaction data
  useEffect(() => {
    const loadTransaction = async () => {
      setLoading(true)
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!currentUser) {
          router.push('/login')
          return
        }
        setUser(currentUser)

        if (isSettlement && settlementId) {
          const { data: s, error: sError } = await supabase
            .from('settlements')
            .select('id, sender_id, receiver_id, amount, created_at, date, ledger_id, note')
            .eq('id', settlementId)
            .single()

          if (sError || !s) {
            handleError(sError, 'load repayment data failed')
            router.back()
            return
          }

          setAmount(String(s.amount ?? '0'))
          setSettlementSenderId(s.sender_id)
          setSettlementReceiverId(s.receiver_id)
          setSettlementCreatedAt(s.date ? new Date(s.date) : s.created_at ? new Date(s.created_at) : new Date())
          
          // Determine if this user is receiver or sender
          const isReceiver = s.receiver_id === currentUser.id;
          setTransactionType('income') // Force to "Receive Repayment" mode
          setSelectedDate(s.date ? new Date(s.date) : s.created_at ? new Date(s.created_at) : new Date())
          setNote(s.note || '')
          
          // Repayment UI state: Always treat as "I am receiver" for the form
          if (isReceiver) {
            setRepaymentParticipantIds([s.sender_id])
            setOriginalRepaymentParticipantIds([s.sender_id])
          } else {
            // If it was originally a "Pay Repayment", swap roles for editing
            setRepaymentParticipantIds([s.receiver_id])
            setOriginalRepaymentParticipantIds([s.receiver_id])
          }

          setSelectedCategory(null) // Repayment doesn't have category_id in settlements table
          setSelectedCategoryName('To receive from') // Set to special repayment category name
          setLoading(false)
          return
        }

        // Load transaction
        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .select(`
            *,
            categories (
              id,
              name,
              icon
            )
          `)
          .eq('id', transactionId)
          .single()

        if (txError || !transaction) {
          console.error('Error loading transaction:', txError)
          router.push('/')
          return
        }

        // Check if user has access to the ledger of this transaction
        const transactionLedgerId = transaction.ledger_id
        if (transactionLedgerId) {
          // Check if user is a member of this ledger
          const { data: ledgerMember, error: memberError } = await supabase
            .from('ledger_members')
            .select('role')
            .eq('ledger_id', transactionLedgerId)
            .eq('user_id', currentUser.id)
            .limit(1)

          // If not a ledger member, check account_book
          if (memberError || !ledgerMember || ledgerMember.length === 0) {
            const { data: book, error: bookError } = await supabase
              .from('account_books')
              .select('owner_id')
              .eq('id', transactionLedgerId)
              .limit(1)

            if (!bookError && book && book.length > 0) {
              if (book[0]?.owner_id !== currentUser.id) {
                // Check book_members
                const { data: bookMember, error: bookMemberError } = await supabase
                  .from('book_members')
                  .select('role')
                  .eq('book_id', transactionLedgerId)
                  .eq('user_id', currentUser.id)
                  .limit(1)

                if (bookMemberError || !bookMember || bookMember.length === 0) {
                  // User doesn't have access to this ledger
                  router.push('/')
                  return
                }
              }
            } else {
              // User doesn't have access to this ledger
              router.push('/')
              return
            }
          }
        }

        setOriginalTransaction(transaction)
        setTransactionType(transaction.type === 'income' ? 'income' : 'expense')
        setAmount(transaction.amount.toString())
        setSelectedCategory(transaction.category_id)
        setSelectedCategoryName(transaction.categories?.name || null)
        setNote(transaction.description || '')
        setSelectedDate(new Date(transaction.date))
        setPayerId(
          transaction.type === 'expense'
            ? ((transaction as any).expense_payment_source === 'deposit' ? DEPOSIT_PAYER_ID : transaction.payer_id)
            : ''
        )
        setDepositManagerId(transaction.type === 'income' && transaction.income_mode === 'deposit' ? transaction.payer_id : '')
        setIncomeMode((transaction.income_mode === 'deposit' || transaction.income_mode === 'bonus') ? transaction.income_mode : 'personal')

        // Participants are now loaded via useParticipants hook

            // Load transaction splits for expense
            if (transaction.type === 'expense') {
              // Restore persisted UI state (preferred)
              const hasPersistedSplitIds = typeof transaction.split_with_ids !== 'undefined'
              const hasPersistedSplitAmounts = typeof transaction.split_with_amounts !== 'undefined'
              const hasPersistedPublic = typeof transaction.is_public_expense !== 'undefined' || typeof transaction.public_amount !== 'undefined'

              if (hasPersistedPublic) {
                setIsPublicExpense(!!transaction.is_public_expense)
                if (transaction.is_public_expense) {
                  setPublicAmount(transaction.public_amount !== null && typeof transaction.public_amount !== 'undefined'
                    ? String(transaction.public_amount)
                    : '0')
                  setPublicAmountManuallySet(true)
                  setPublicShareParticipantIds(Array.isArray(transaction.public_share_participant_ids) ? transaction.public_share_participant_ids : [])
                } else {
                  setPublicAmount('')
                  setPublicAmountManuallySet(false)
                  setPublicShareParticipantIds([])
                }
              }

              if (hasPersistedSplitIds) {
                setSelectedParticipantIds(Array.isArray(transaction.split_with_ids) ? transaction.split_with_ids : [])
              }

              if (hasPersistedSplitAmounts && transaction.split_with_amounts && typeof transaction.split_with_amounts === 'object') {
                const obj: Record<string, string> = {}
                for (const [k, v] of Object.entries(transaction.split_with_amounts)) {
                  const n = Number(v as any)
                  if (!isNaN(n)) obj[k] = String(Math.ceil(n))
                }
                setCustomSplitAmounts(obj)
              } else if (hasPersistedSplitAmounts) {
                setCustomSplitAmounts({})
              }

              const { data: splits, error: splitsError } = await supabase
                .from('transaction_splits')
                .select('user_id, amount')
                .eq('transaction_id', transactionId)

              if (splitsError) {
                handleError(splitsError, 'load split record failed')
              }

              // Fallback for legacy rows (columns not present / not returned)
              if ((!hasPersistedSplitIds && !hasPersistedSplitAmounts) && splits && splits.length > 0) {
                const participantIds = splits.map((s: any) => s.user_id).filter(Boolean)
                setSelectedParticipantIds(Array.from(new Set(participantIds)))
                const obj: Record<string, string> = {}
                splits.forEach((s: any) => {
                  if (s?.user_id) obj[s.user_id] = String(Math.ceil(Number(s.amount || 0)))
                })
                setCustomSplitAmounts(obj)
              }
            }

            // Restore income (deposit) split state
            if (transaction.type === 'income' && transaction.categories?.name !== 'To receive from') {
              const mode = transaction.income_mode === 'deposit' ? 'deposit' : 'personal'
              if (mode === 'deposit') {
                setDepositParticipantIds(Array.isArray(transaction.split_with_ids) ? transaction.split_with_ids : [])
                if (transaction.split_with_amounts && typeof transaction.split_with_amounts === 'object') {
                  const obj: Record<string, string> = {}
                  for (const [k, v] of Object.entries(transaction.split_with_amounts)) {
                    const n = Number(v as any)
                    if (!isNaN(n)) obj[k] = String(Math.ceil(n))
                  }
                  setDepositSplitAmounts(obj)
                } else {
                  setDepositSplitAmounts({})
                }
              } else {
                setDepositParticipantIds([])
                setDepositSplitAmounts({})
              }
            }

            // Note: "To receive from" category doesn't create transactions in add page,
            // so if we're editing a transaction, it shouldn't have "To receive from" category.
            // But we handle it for edge cases: if category is "To receive from", 
            // try to load settlements (even though this shouldn't normally happen)
            if (transaction.type === 'income' && transaction.categories?.name === 'To receive from') {
              // Try to load settlements for this repayment (if any)
              // Match by ledger_id and receiver_id (no date field in settlements in add page)
              const { data: settlements, error: settlementsError } = await supabase
                .from('settlements')
                .select('sender_id')
                .eq('ledger_id', transaction.ledger_id)
                .eq('receiver_id', transaction.payer_id)
                .limit(10) // Limit to avoid too many results

              if (!settlementsError && settlements && settlements.length > 0) {
                const participantIds = settlements.map(s => s.sender_id)
                setRepaymentParticipantIds(participantIds)
                setOriginalRepaymentParticipantIds(participantIds) // Store original for deletion
              }
            }
      } catch (error) {
        handleError(error, 'load transaction data failed')
        router.back()
      } finally {
        setLoading(false)
      }
    }

    if (transactionId && activeLedger) {
      loadTransaction()
    }
  }, [transactionId, activeLedger, supabase, router])

  useEffect(() => {
    if (!isMultiMemberLedger) {
      if (incomeMode === 'deposit') setIncomeMode('personal')
      if (payerId === DEPOSIT_PAYER_ID) setPayerId(user?.id || '')
    }
  }, [isMultiMemberLedger, incomeMode, payerId, user?.id])

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
    if (amount.includes("+") || amount.includes("×") || amount.includes("÷") || (amount.includes("-") && amount.split("-").length > 2)) {
      handleCalculate();
    }
    const num = parseFloat(amount);
    if (!isNaN(num) && num > 0 && !amount.includes("+") && !amount.includes("×") && !amount.includes("÷") && !(amount.includes("-") && amount.split("-").length > 2)) {
      setShowKeypad(false);
    }
  }, [amount, handleCalculate]);

  const toLocalDateString = useCallback((date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [])

  // Auto-disable shared expense if ledger becomes single-member
  useEffect(() => {
    if (!isMultiMemberLedger && isPublicExpense) {
      setIsPublicExpense(false)
    }
  }, [isMultiMemberLedger, isPublicExpense])

  // Auto-calculate shared expense amount when total changes (same behavior as /add)
  useEffect(() => {
    if (isPublicExpense && amount) {
      const totalAmount = parseFloat(amount) || 0
      if (totalAmount > 0) {
        const totalInt = Math.ceil(totalAmount)
        // Use public share participants count if set, otherwise use all participants
        const publicShareCount = publicShareParticipantIds.length > 0 
          ? publicShareParticipantIds.length 
          : participants.length
        const memberCount = Math.max(1, publicShareCount || 1)

        const sumCustom = selectedParticipantIds.reduce((sum, id) => {
          const v = customSplitAmounts[id]
          const n = Number(v)
          if (v === undefined || v === '' || isNaN(n) || n <= 0) return sum
          return sum + Math.ceil(n)
        }, 0)

        const calculatedPublicAmount = sumCustom > 0 ? Math.max(0, totalInt - sumCustom) : Math.ceil(totalInt / memberCount)

        if (!publicAmountManuallySet) {
          setPublicAmount(calculatedPublicAmount.toString())
          setPublicAmountManuallySet(false)
        }
      }
    } else {
      setPublicAmount('')
      setPublicAmountManuallySet(false)
    }
  }, [amount, isPublicExpense, publicAmountManuallySet, participants.length, selectedParticipantIds, customSplitAmounts])

  const computeCustomSplits = useCallback((total: number, ids: string[], overrideAmounts?: Record<string, string>) => {
    const totalInt = Math.max(0, Math.ceil(Number(total) || 0))
    const normalizedIds = ids.filter(Boolean)
    const amountsMap = overrideAmounts ?? customSplitAmounts
    const fixed: Record<string, number> = {}
    let fixedSum = 0
    const remainingIds: string[] = []

    for (const id of normalizedIds) {
      const v = amountsMap[id]
      if (v === undefined || v === '') {
        remainingIds.push(id)
        continue
      }
      const n = Number(v)
      if (!isNaN(n) && n >= 0) {
        const amt = Math.ceil(n)
        fixed[id] = amt
        fixedSum += amt
      } else {
        remainingIds.push(id)
      }
    }

    if (fixedSum > totalInt) {
      return { ok: false as const, amounts: {} as Record<string, number> }
    }

    const remaining = totalInt - fixedSum
    const autoCount = remainingIds.length
    const autoAmounts: Record<string, number> = {}
    if (autoCount > 0) {
      // Everyone rounds up to integer; any extra due to rounding belongs to payer.
      const per = Math.ceil(remaining / autoCount)
      for (let i = 0; i < remainingIds.length; i++) {
        const id = remainingIds[i]
        autoAmounts[id] = per
      }
    }

    const amounts: Record<string, number> = {}
    for (const id of normalizedIds) {
      if (fixed[id] !== undefined) amounts[id] = fixed[id]
      else amounts[id] = autoAmounts[id] ?? 0
    }

    return { ok: true as const, amounts }
  }, [customSplitAmounts])

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

  const handleSave = async () => {
    if (saving) return

    if (!isValidAmount()) {
      return
    }

    setSaving(true)

    try {
      if (isSettlement && settlementId) {
        const finalAmount = parseFloat(amount)
        if (isNaN(finalAmount) || finalAmount <= 0) {
          handleError(null, '請輸入有效金額')
          setSaving(false)
          return
        }

        const isReceiver = transactionType === 'income'
        const counterpartyId = repaymentParticipantIds[0]

        if (!counterpartyId) {
          handleError(null, '請選擇對象')
          setSaving(false)
          return
        }

        const { error: updateError } = await supabase
          .from('settlements')
          .update({ 
            amount: Math.round(finalAmount * 100) / 100,
            sender_id: isReceiver ? counterpartyId : user.id,
            receiver_id: isReceiver ? user.id : counterpartyId,
            date: selectedDate.toISOString(), // 同時更新 date
            created_at: selectedDate.toISOString(), // 與 created_at
            note: note?.trim() || null
          })
          .eq('id', settlementId)

        if (updateError) {
          handleError(updateError, 'update repayment failed')
          setSaving(false)
          return
        }

        queryClient.invalidateQueries({ queryKey: ['transactions'], exact: false })
        queryClient.invalidateQueries({ queryKey: ['settlements'], exact: false })
        queryClient.invalidateQueries({ queryKey: ['outstandingTotal'], exact: false })
        router.back()
        return
      }

      if (!selectedCategory) {
        handleError(null, 'please select category')
        setSaving(false)
        return
      }

      if (!activeLedger || !activeLedger.id) {
        handleError(null, 'active book not found')
        setSaving(false)
        return
      }

      const finalAmount = parseFloat(amount)
      const ledgerId = activeLedger.id
      const ledgerType = activeLedger.type
      // Save as local date-only string to avoid timezone shifting (off-by-one day)
      const transactionDate = toLocalDateString(selectedDate)
      const totalAmount = finalAmount
      const totalInt = Math.ceil(totalAmount)

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

          // Delete old settlements that were associated with this transaction
          // Only delete if we have original repayment participants (meaning it was repayment before)
          // Match by ledger_id, receiver_id, and sender_id in the original list
          let deleteError: any = null;
          if (originalRepaymentParticipantIds.length > 0) {
            const { error } = await supabase
              .from('settlements')
              .delete()
              .eq('ledger_id', ledgerId)
              .eq('receiver_id', user.id)
              .in('sender_id', originalRepaymentParticipantIds)

            deleteError = error;
          } else {
            // If no original repayment participants, this means it was originally a general income transaction
            // In this case, we don't need to delete old settlements (there shouldn't be any)
            // Just proceed to create new settlements
          }

          if (deleteError) {
            handleError(deleteError, 'delete old settlements failed')
            setSaving(false)
            return
          }

          // Create new settlements
          const settlementRecords = repaymentParticipantIds.map((participantId) => {
            const settlementData: any = {
              sender_id: participantId,
              receiver_id: user.id,
              amount: Math.round((totalAmount / repaymentParticipantIds.length) * 100) / 100,
            };
            settlementData.ledger_id = ledgerId;
            return settlementData;
          });

          const { error: settlementError } = await supabase
            .from("settlements")
            .insert(settlementRecords);

          if (settlementError) {
            handleError(settlementError, 'save repayment record failed');
            setSaving(false);
            return;
          }

          // Delete the transaction (repayment doesn't use transactions table)
          const { error: deleteTxError } = await supabase
            .from('transactions')
            .delete()
            .eq('id', transactionId)

          if (deleteTxError) {
            handleError(deleteTxError, 'delete transaction failed')
            setSaving(false)
            return
          }

          // Success: Refresh and navigate back
          await refreshLedgers()
          // Invalidate caches so previous screen auto-refreshes
          queryClient.invalidateQueries({ queryKey: ['transactions', ledgerId, ledgerType], exact: false })
          queryClient.invalidateQueries({ queryKey: ['ledgerBalance', ledgerId, ledgerType], exact: false })
          router.back()
          return
        } else {
          // General income: Update transaction with category
          // Delete old settlements if any (in case it was repayment before)
          // Only delete if we have original repayment participants (meaning it was repayment before)
          if (originalRepaymentParticipantIds.length > 0) {
            await supabase
              .from('settlements')
              .delete()
              .eq('ledger_id', ledgerId)
              .eq('receiver_id', user.id)
              .in('sender_id', originalRepaymentParticipantIds)
          }

          const categoryId: string | null = selectedCategory; // Use selectedCategory directly
          if (incomeMode === 'deposit') {
            if (!isMultiMemberLedger) {
              handleError(null, 'this book has no other members, cannot use deposit')
              setSaving(false)
              return
            }
            if (!depositManagerId) {
              handleError(null, 'please select manager/receiver')
              setSaving(false)
              return
            }
            if (depositParticipantIds.length === 0) {
              handleError(null, 'please select contributors')
              setSaving(false)
              return
            }

            const totalInt = Math.ceil(finalAmount)
            const computed = computeCustomSplits(totalInt, depositParticipantIds, depositSplitAmounts)
            if (!computed.ok) {
              handleError(null, 'split amount cannot exceed total amount')
              setSaving(false)
              return
            }
            const splitSum = depositParticipantIds.reduce((sum, id) => sum + (computed.amounts[id] || 0), 0)
            
            // 檢查分攤金額是否足夠（進位後可能會多一點，但不能少）
            if (Math.ceil(splitSum) < totalInt) {
              handleError(null, `split amount total (${Math.ceil(splitSum)}) is less than input total (${totalInt})`)
              setSaving(false)
              return
            }
            
            const incomeAmount = Math.ceil(splitSum)

            const { error: updateError } = await supabase
              .from('transactions')
              .update({
                amount: incomeAmount,
                type: 'income',
                income_mode: 'deposit',
                category_id: categoryId,
                description: note?.trim() || null,
                date: transactionDate,
                payer_id: depositManagerId,
                split_with_ids: depositParticipantIds,
                split_with_amounts: (() => {
                  const obj: Record<string, number> = {}
                  depositParticipantIds.forEach((id) => {
                    obj[id] = Math.ceil(computed.amounts[id] || 0)
                  })
                  return obj
                })(),
                is_public_expense: false,
                public_amount: null,
                public_share_participant_ids: null,
              })
              .eq('id', transactionId)

            if (updateError) {
              handleError(updateError, 'update transaction failed')
              setSaving(false)
              return
            }

            // 先更新 transaction 成功後，再刪除舊 splits
            const { error: deleteError } = await supabase
              .from('transaction_splits')
              .delete()
              .eq('transaction_id', transactionId)

            if (deleteError) {
              handleError(deleteError, 'delete old splits failed')
              setSaving(false)
              return
            }

            const splitRecords = depositParticipantIds.map((id) => ({
              transaction_id: transactionId,
              ledger_id: ledgerType === 'ledger' ? ledgerId : null,
              book_id: ledgerType === 'account_book' ? ledgerId : null,
              user_id: id,
              amount: Math.ceil(computed.amounts[id] || 0),
            }))

            if (splitRecords.length > 0) {
              const { error: splitError } = await supabase.from('transaction_splits').insert(splitRecords)
              if (splitError) {
                // 如果 splits 創建失敗，嘗試恢復舊 splits（但由於已刪除，無法完全恢復）
                // 至少提示用戶需要重新編輯
                handleError(splitError, 'save split failed, please edit this transaction again')
                setSaving(false)
                return
              }
            }
          } else {
            const { error: updateError } = await supabase
              .from('transactions')
              .update({
                amount: finalAmount,
                type: 'income',
                income_mode: 'personal',
                category_id: categoryId,
                description: note?.trim() || null,
                date: transactionDate,
                payer_id: user.id,
                split_with_ids: [],
                split_with_amounts: null,
                is_public_expense: false,
                public_amount: null,
                public_share_participant_ids: null,
              })
              .eq('id', transactionId)

            if (updateError) {
              handleError(updateError, 'update transaction failed')
              setSaving(false)
              return
            }

            // 先更新 transaction 成功後，再刪除舊 splits
            const { error: deleteError } = await supabase
              .from('transaction_splits')
              .delete()
              .eq('transaction_id', transactionId)

            if (deleteError) {
              handleError(deleteError, 'delete old splits failed')
              setSaving(false)
              return
            }

            // Add split record for personal income
            const { error: splitError } = await supabase
              .from("transaction_splits")
              .insert({
                transaction_id: transactionId,
                ledger_id: ledgerType === 'ledger' ? ledgerId : null,
                book_id: ledgerType === 'account_book' ? ledgerId : null,
                user_id: user.id,
                amount: finalAmount,
              });

            if (splitError) {
              // 如果 split 創建失敗，提示用戶需要重新編輯
              handleError(splitError, 'save split failed, please edit this transaction again')
              setSaving(false)
              return
            }
          }
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
          const currentDepositBalance = depositIncome - depositExpense

          const originalWasDepositExpense =
            originalTransaction?.type === 'expense' && originalTransaction?.expense_payment_source === 'deposit'
          const availableDepositBalance = currentDepositBalance + (originalWasDepositExpense ? Number(originalTransaction?.amount || 0) : 0)

          if (totalInt > availableDepositBalance) {
            handleError(null, 'deposit balance is not enough, cannot save')
            setSaving(false)
            return
          }
        }

        // Expense mode: Update transaction and splits (supports Shared expense like /add)
        const categoryId: string | null = selectedCategory
        if (isPublicExpense) {
          const p = parseFloat(publicAmount)
          if (!publicAmount || isNaN(p) || p <= 0) {
            handleError(null, 'please enter public amount')
            setSaving(false)
            return
          }
          if (totalInt > 0 && !isNaN(p) && Math.ceil(p) > totalInt) {
            handleError(null, 'public amount cannot exceed total amount')
            setSaving(false)
            return
          }
        }

        const { error: updateError } = await supabase
          .from('transactions')
          .update({
            amount: totalInt,
            type: transactionType,
            category_id: categoryId,
            description: note?.trim() || null,
            date: transactionDate,
            payer_id: payerId === DEPOSIT_PAYER_ID ? null : (payerId || user.id),
            split_with_ids: selectedParticipantIds || [],
            split_with_amounts: (() => {
              const obj: Record<string, number> = {}
              ;(selectedParticipantIds || []).forEach((id) => {
                const v = customSplitAmounts[id]
                const n = Number(v)
                if (v !== undefined && v !== '' && !isNaN(n) && n >= 0) {
                  obj[id] = Math.ceil(n)
                }
              })
              return Object.keys(obj).length > 0 ? obj : null
            })(),
            is_public_expense: !!isPublicExpense,
            public_amount: isPublicExpense ? Math.ceil(parseFloat(publicAmount) || 0) : null,
            public_share_participant_ids:
              isPublicExpense && publicShareParticipantIds.length > 0 ? publicShareParticipantIds : null,
            expense_payment_source: payerId === DEPOSIT_PAYER_ID ? 'deposit' : 'personal',
          })
          .eq('id', transactionId)

        if (updateError) {
          handleError(updateError, 'update transaction failed')
          setSaving(false)
          return
        }

        // 先更新 transaction 成功後，再刪除舊 splits
        const { data: existingSplits } = await supabase
        .from('transaction_splits')
        .select('id, user_id, amount')
        .eq('transaction_id', transactionId)
      const { error: deleteError } = await supabase

          .from('transaction_splits')
          .delete()
          .eq('transaction_id', transactionId)
          const { data: remainingSplits } = await supabase
          .from('transaction_splits')
          .select('id, user_id, amount')
          .eq('transaction_id', transactionId)
        console.log('Remaining splits after delete:', remainingSplits)

        if (deleteError) {
          handleError(deleteError, 'delete old splits failed')
          setSaving(false)
          return
        }

        // Create new splits
        const effectiveSplitWithIds =
          selectedParticipantIds.length > 0
            ? selectedParticipantIds
            : payerId === DEPOSIT_PAYER_ID
              ? participants.map((p) => p.id).filter(Boolean)
              : payerId
                ? [payerId]
                : []
        if (effectiveSplitWithIds.length > 0) {
          let splitRecords: Array<{ transaction_id: string; ledger_id: string | null; book_id: string | null; user_id: string; amount: number }> = []

          if (isPublicExpense) {
            const finalPayerId = payerId === DEPOSIT_PAYER_ID ? DEPOSIT_PAYER_ID : (payerId || user.id)
            const memberCount = Math.max(1, participants.length || 1)
            const rawPublicAmount =
              publicAmount && parseFloat(publicAmount) > 0
                ? parseFloat(publicAmount)
                : totalInt / memberCount
            const publicInt = Math.ceil(Math.max(0, Math.min(rawPublicAmount, totalInt)))

            const remainingAmount = totalInt - publicInt

            // Public Share participants:
            // - If none selected: ALL members share
            // - If selected: ONLY selected participants share (do NOT force-include payer)
            const defaultPublicShareIds = participants.map((p) => p.id)
            const basePublicShareIds = publicShareParticipantIds.length > 0 ? publicShareParticipantIds : defaultPublicShareIds
            const publicShareParticipants = Array.from(new Set(basePublicShareIds))
            const publicShareCount = publicShareParticipants.length

            if (publicShareCount === 0) {
              handleError(null, 'please select public share participants')
              setSaving(false)
              return
            }

            // Public share: everyone rounds up; extra belongs to payer.
            const publicSharePerPerson = Math.ceil(publicInt / publicShareCount)

            // Personal share: Split with participants (empty => payer-only), allow custom amounts
            const personalShareParticipants = effectiveSplitWithIds.length > 0 ? effectiveSplitWithIds : [finalPayerId]
            const personalShares = computeCustomSplits(remainingAmount, personalShareParticipants)
            if (!personalShares.ok) {
              handleError(null, 'split amount cannot exceed total amount')
              setSaving(false)
              return
            }

            // Debtors: union of selected participants + public share participants (exclude payer)
            const allPotentialDebtorIds = [...new Set([...effectiveSplitWithIds, ...basePublicShareIds])]

            // Calculate total public share after rounding up
            const totalPublicShareRounded = publicSharePerPerson * publicShareCount
            // Calculate the excess from rounding (this should reduce payer's share)
            const publicShareExcess = totalPublicShareRounded - publicInt

            splitRecords = allPotentialDebtorIds.map((participantId) => {
              const isInPublicShare = publicShareParticipants.includes(participantId)
              const publicShare = isInPublicShare ? publicSharePerPerson : 0
              const isPersonalShare = personalShareParticipants.includes(participantId)
              const personalShare = isPersonalShare ? (personalShares.amounts[participantId] || 0) : 0
              let totalDebt = Math.ceil(publicShare + personalShare)

              // If this is the payer and there's excess from rounding, reduce their debt
              if (participantId === finalPayerId && publicShareExcess > 0 && isInPublicShare) {
                totalDebt = Math.max(0, totalDebt - publicShareExcess)
              }

              return {
                transaction_id: transactionId,
                ledger_id: ledgerType === 'ledger' ? ledgerId : null,
                book_id: ledgerType === 'account_book' ? ledgerId : null,
                user_id: participantId,
                amount: totalDebt,
              }
            }).filter((r) => r.amount > 0)
          } else {
            // Regular expense: split among Split with participants (empty => payer-only)
            const custom = computeCustomSplits(totalInt, effectiveSplitWithIds)
            if (!custom.ok) {
              handleError(null, '分攤金額不可超過總金額')
              setSaving(false)
              return
            }
            splitRecords = effectiveSplitWithIds.map((participantId) => ({
              transaction_id: transactionId,
              ledger_id: ledgerType === 'ledger' ? ledgerId : null,
              book_id: ledgerType === 'account_book' ? ledgerId : null,
              user_id: participantId,
              amount: Math.ceil(custom.amounts[participantId] || 0),
            }))
          }

          if (splitRecords.length > 0) {
            const { error: splitError } = await supabase
              .from('transaction_splits')
              .insert(splitRecords)

            if (splitError) {
              // 如果 splits 創建失敗，嘗試恢復舊 splits（但由於已刪除，無法完全恢復）
              // 至少提示用戶需要重新編輯
              handleError(splitError, 'save split failed, please edit this transaction again')
              setSaving(false)
              return
            }
          }
        }
      }

      await refreshLedgers()
      // Invalidate caches so previous screen auto-refreshes
      await queryClient.invalidateQueries({ queryKey: ['transactions'], exact: false })
      await queryClient.invalidateQueries({ queryKey: ['settlements'], exact: false })
      await queryClient.invalidateQueries({ queryKey: ['ledgerBalance'], exact: false })
      await queryClient.invalidateQueries({ queryKey: ['outstandingTotal'], exact: false })
      router.back()
    } catch (error) {
      handleError(error, 'save transaction failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    if (!activeLedger?.id) return

    setDeleting(true)

    try {
      if (isSettlement && settlementId) {
        const { error: deleteError } = await supabase
          .from('settlements')
          .delete()
          .eq('id', settlementId)

        if (deleteError) {
          handleError(deleteError, 'delete settlement failed')
          setDeleting(false)
          return
        }

        await queryClient.invalidateQueries({ queryKey: ['transactions'], exact: false })
        await queryClient.invalidateQueries({ queryKey: ['settlements'], exact: false })
        await queryClient.invalidateQueries({ queryKey: ['outstandingTotal'], exact: false })
        await queryClient.invalidateQueries({ queryKey: ['ledgerBalance'], exact: false })
        router.back()
        return
      }

      if (!originalTransaction) {
        setDeleting(false)
        return
      }

      // Delete transaction splits first (if any)
      await supabase
        .from('transaction_splits')
        .delete()
        .eq('transaction_id', transactionId)

      // Delete settlements (if any) - match by ledger_id and receiver_id
      // Note: settlements in add page don't have date field, so we match without it
      if (originalTransaction.type === 'income') {
        await supabase
          .from('settlements')
          .delete()
          .eq('ledger_id', originalTransaction.ledger_id)
          .eq('receiver_id', originalTransaction.payer_id)
      }

      // Delete transaction
      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transactionId)

      if (deleteError) {
        handleError(deleteError, 'delete transaction failed')
        setDeleting(false)
        return
      }

      await refreshLedgers()
      // Invalidate caches so previous screen auto-refreshes
      await queryClient.invalidateQueries({ queryKey: ['transactions'], exact: false })
      await queryClient.invalidateQueries({ queryKey: ['ledgerBalance'], exact: false })
      await queryClient.invalidateQueries({ queryKey: ['outstandingTotal'], exact: false })
      await queryClient.invalidateQueries({ queryKey: ['settlements'], exact: false })
      router.back()
    } catch (error) {
      handleError(error, 'delete transaction failed')
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${month}/${day}/${year}`
  }

  // Calculate splits for expense display
  const calculateSplits = useCallback(() => {
    const totalAmount = parseFloat(amount) || 0
    const totalInt = Math.ceil(totalAmount)
    const effectiveSplitWithIds =
      selectedParticipantIds.length > 0
        ? selectedParticipantIds
        : payerId === DEPOSIT_PAYER_ID
          ? participants.map((p) => p.id).filter(Boolean)
          : payerId
            ? [payerId]
            : []
    if (totalAmount <= 0 || !payerId) {
      return { payer: null, debtors: [] }
    }

    const payer = expensePayerOptions().find((p) => p.id === payerId)
    if (!payer) {
      return { payer: null, debtors: [] }
    }

    const finalPayerId = payerId

    if (isPublicExpense) {
      const rawPublicAmount =
        publicAmount && parseFloat(publicAmount) > 0
          ? parseFloat(publicAmount)
          : totalInt / Math.max(1, participants.length || 1)
      const finalPublicAmount = Math.ceil(Math.max(0, Math.min(rawPublicAmount, totalInt)))

      const remainingAmount = totalInt - finalPublicAmount

      const basePublicShareIds = publicShareParticipantIds.length > 0 ? publicShareParticipantIds : participants.map((p) => p.id)
      const publicShareParticipants = Array.from(new Set(basePublicShareIds))
      const publicShareCount = publicShareParticipants.length
      if (publicShareCount === 0) {
        return { payer: null, debtors: [] }
      }

      const publicSharePerPerson = Math.ceil(finalPublicAmount / publicShareCount)
      
      // Calculate total public share after rounding up
      const totalPublicShareRounded = publicSharePerPerson * publicShareCount
      // Calculate the excess from rounding (this should reduce payer's share)
      const publicShareExcess = totalPublicShareRounded - finalPublicAmount

      const personalShareParticipants = effectiveSplitWithIds.length > 0 ? effectiveSplitWithIds : [finalPayerId]
      const personalShares = computeCustomSplits(remainingAmount, personalShareParticipants)
      if (!personalShares.ok) {
        return { payer: null, debtors: [] }
      }

      const allDebtorIds = Array.from(new Set([...effectiveSplitWithIds, ...basePublicShareIds])).filter(
        (id) => id !== finalPayerId
      )

      const debtors = allDebtorIds
        .map((participantId) => {
          const participant = participants.find((p) => p.id === participantId)
          if (!participant) return null

          const isInPublicShare = publicShareParticipants.includes(participantId)
          const publicShare = isInPublicShare ? publicSharePerPerson : 0

          const isPersonalShare = personalShareParticipants.includes(participantId)
          const personalShare = isPersonalShare ? (personalShares.amounts[participantId] || 0) : 0

          const totalDebt = Math.ceil(publicShare + personalShare)
          return totalDebt > 0 ? { 
            participant, 
            amount: totalDebt,
            publicShare: Math.ceil(publicShare),
            personalShare: Math.ceil(personalShare)
          } : null
        })
        .filter((d): d is { participant: Participant; amount: number; publicShare: number; personalShare: number } => d !== null && d !== undefined)

      // Calculate payer's share (reduced by excess from rounding)
      const isPayerInPublicShare = publicShareParticipants.includes(finalPayerId)
      let payerAmount = 0
      if (isPayerInPublicShare) {
        const payerPublicShare = Math.max(0, publicSharePerPerson - publicShareExcess)
        const isPayerPersonalShare = personalShareParticipants.includes(finalPayerId)
        const payerPersonalShare = isPayerPersonalShare ? (personalShares.amounts[finalPayerId] || 0) : 0
        payerAmount = Math.ceil(payerPublicShare + payerPersonalShare)
      }

      const totalAmountToCollect = debtors.reduce((sum, debtor) => sum + debtor.amount, 0)
      const payerOutOfPocket = Math.max(0, totalInt - totalAmountToCollect - payerAmount)

      return {
        payer: {
          participant: payer,
          amount: payerAmount > 0 ? payerAmount : Math.ceil(payerOutOfPocket),
        },
        debtors,
      }
    }

    // Regular expense
    const otherParticipants = effectiveSplitWithIds.filter((id) => id !== finalPayerId)

    if (otherParticipants.length === 0) {
      return {
        payer: {
          participant: payer,
          amount: totalInt,
        },
        debtors: [],
      }
    }

    const custom = computeCustomSplits(totalInt, effectiveSplitWithIds)
    if (!custom.ok) {
      return { payer: null, debtors: [] }
    }
    const debtors = otherParticipants
      .map((id) => {
        const participant = participants.find((p) => p.id === id)
        if (!participant) return null
        return {
          participant,
          amount: Math.ceil(custom.amounts[id] || 0),
        }
      })
      .filter((d): d is { participant: Participant; amount: number } => d !== null)

    const totalAmountToCollect = debtors.reduce((sum, debtor) => sum + debtor.amount, 0)
    const payerOutOfPocket = Math.max(0, totalInt - totalAmountToCollect)

    return {
      payer: {
        participant: payer,
        amount: Math.ceil(payerOutOfPocket),
      },
      debtors,
    }
  }, [amount, selectedParticipantIds, payerId, participants, isPublicExpense, publicAmount, publicShareParticipantIds, computeCustomSplits])

  const { payer, debtors } = transactionType === 'expense' ? calculateSplits() : { payer: null, debtors: [] }

  // Validation logic for save button
  const canSave = () => {
    if (isViewer) return false;
    // Must have valid amount
    if (!isValidAmount()) {
      return false;
    }

    // For repayments (settlements)
    if (isSettlement) {
      return repaymentParticipantIds.length > 0;
    }

    // Must have selected category for regular transactions
    if (!selectedCategory) {
      return false;
    }

    // Must have active ledger
    if (!activeLedger || !activeLedger.id) {
      return false;
    }

    if (transactionType === 'expense' && !payerId) {
      return false
    }

    // For "To receive from" category (only in income mode), must have repayment participants
    if (transactionType === "income" && selectedCategoryName === 'To receive from') {
      if (repaymentParticipantIds.length === 0) {
        return false;
      }
    }

    if (transactionType === 'income' && selectedCategoryName !== 'To receive from') {
      if (incomeMode === 'deposit') {
        if (!depositManagerId) return false
        if (depositParticipantIds.length === 0) return false
      }
    }

    if (transactionType === 'expense' && isPublicExpense) {
      const total = Math.ceil(parseFloat(amount) || 0)
      const p = parseFloat(publicAmount)
      if (!publicAmount || isNaN(p) || p <= 0) {
        return false
      }
      if (total > 0 && !isNaN(p) && Math.ceil(p) > total) {
        return false
      }
    }

    return true;
  };

  if (loading) {
    return (
      <>
        <ErrorToast
          message={error?.message || ''}
          isVisible={isErrorVisible}
          onClose={clearError}
          details={error?.details}
        />
        <Loading fullScreen message="Loading..." />
      </>
    )
  }

  // Check if user has access to the ledger - redirect to home if not
  // This check happens after loading is complete
  if (!isLoadingRole && role === null && user && activeLedger) {
    // User is logged in but doesn't have access to this ledger
    router.push('/')
    return (
      <>
        <ErrorToast
          message={error?.message || ''}
          isVisible={isErrorVisible}
          onClose={clearError}
          details={error?.details}
        />
        <Loading fullScreen message="Redirecting..." />
      </>
    )
  }

  if (isSettlement) {
    const isReceiver = transactionType === 'income';
    const title = 'Received Payment'

    return (
      <>
        <ErrorToast
          message={error?.message || ''}
          isVisible={isErrorVisible}
          onClose={clearError}
          details={error?.details}
        />
        <div className="w-full max-w-md bg-background-light min-h-screen flex flex-col relative overflow-x-hidden mx-auto" style={{ minHeight: '100dvh' }}>
          <header className="pt-8 pb-4 px-6 flex flex-col gap-4 z-10 sticky top-0 bg-background-light/95 backdrop-blur-sm">
            <div className="flex items-center justify-between w-full">
              <button
                onClick={() => router.back()}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm hover:shadow-md transition-all text-text-muted hover:text-text-main"
            >
              <ArrowLeft className="w-5 h-5" />
              </button>
            <h1 className="text-lg font-bold text-text-main">{title}</h1>
            <div className="w-10"></div>
            </div>
          </header>

          <main 
            className="flex-1 overflow-y-auto no-scrollbar px-6" 
            style={{ 
              WebkitOverflowScrolling: 'touch' as any,
              paddingBottom: showKeypad ? '450px' : '128px',
              transition: 'padding-bottom 0.3s ease-in-out'
            }}
          >
            <div className="mt-4 mb-8 text-center relative z-[101]">
              <div className="flex items-center justify-center gap-3 mx-auto w-full max-w-[320px]">
                <span className="text-3xl font-bold text-primary">$</span>
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowKeypad(true)
                  }}
                  className="bg-white rounded-pill py-4 px-8 shadow-sm border border-gray-100 flex items-center justify-center min-w-[120px] max-w-[240px] cursor-pointer break-all whitespace-pre-wrap text-5xl font-bold text-primary"
                >
                  {amount}
                </div>
              </div>
              </div>

            <div className="flex flex-col gap-4" onClick={() => {
              setShowKeypad(false);
              setEditingAmountType(null);
              setEditingAmountId(null);
            }}>
              {/* Counterparty Selection */}
              <div className="bg-white p-5 rounded-card shadow-sm">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                  {isReceiver ? 'Payer (From)' : 'Receiver (To)'}
                </label>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex -space-x-3 overflow-hidden p-1">
                    {repaymentParticipantIds.map((id, index) => {
                      const participant = participants.find((p) => p.id === id)
                      if (!participant) return null
                      return (
                        <div
                          key={id}
                          className="h-10 w-10 rounded-full ring-2 ring-white overflow-hidden"
                          style={{ zIndex: repaymentParticipantIds.length - index }}
                        >
                          {participant.avatar ? (
                            <img alt={participant.name} src={participant.avatar} className="w-full h-full object-cover" />
                          ) : (
                            <div className="rounded-full size-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                              {participant.name === 'You' ? 'You' : participant.name[0]}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {repaymentParticipantIds.length === 0 && (
                      <div className="h-10 w-10 rounded-full ring-2 ring-white bg-gray-200 flex items-center justify-center text-xs">
                        👤
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowKeypad(false)
                      setTimeout(() => setShowRepaymentModal(true), 100)
                    }}
                    className="text-primary text-sm font-semibold hover:text-primary/80 transition-colors"
                  >
                    Edit Participants
                  </button>
                </div>
              </div>

              {/* Note/Description */}
              <div className="bg-white p-5 rounded-card shadow-sm">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Payment Note
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Payment Source or Note"
                  className="w-full bg-background-light rounded-xl border-none py-3 px-4 text-text-main font-semibold focus:ring-2 focus:ring-primary/20 placeholder-text-muted/50 transition-shadow"
                />
              </div>

              {/* Date */}
              <div className="bg-white p-5 rounded-card shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-text-muted">
                      <span className="material-symbols-outlined">calendar_today</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-text-main">Date</h4>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowKeypad(false)
                      setShowDatePicker(true)
                    }}
                    className="bg-transparent border-none text-right text-text-muted font-medium focus:ring-0 p-0 text-sm"
                  >
                    {formatSimpleDate(selectedDate)}
                  </button>
                </div>
              </div>
            </div>
          </main>

          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background-light via-background-light to-transparent pt-12">
            {!isViewer ? (
            <div className="flex gap-4">
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex-1 h-14 bg-white text-red-500 font-bold rounded-2xl shadow-soft flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
              >
                <span className="material-symbols-outlined">delete</span>
                delete
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !canSave()}
                className={`flex-1 h-14 font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-colors ${
                  saving || !canSave() ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90 shadow-primary/30'
                }`}
              >
                {saving ? 'saving...' : 'save'}
              </button>
            </div>
            ) : (
              <div className="w-full p-4 bg-gray-100 rounded-2xl text-center text-gray-500 font-medium">
                Viewer mode: only for viewing, cannot be modified
              </div>
            )}
          </div>

          {showDeleteModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => setShowDeleteModal(false)}></div>
              <div className="relative w-full max-w-[340px] bg-white rounded-[24px] p-6 shadow-2xl flex flex-col items-center text-center transform transition-all animate-in fade-in zoom-in duration-200">
                <div className="mb-5 flex items-center justify-center size-14 rounded-full bg-red-50 text-red-500">
                  <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>delete</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">confirm deletion</h3>
                <p className="text-slate-500 text-sm mb-8 leading-relaxed px-2">
                Are you sure you want to delete this transaction? This action cannot be undone.
                </p>
                <div className="grid grid-cols-2 gap-4 w-full">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-colors"
                  >
                    cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`py-3.5 px-4 rounded-2xl font-bold text-sm shadow-lg transition-colors ${
                      deleting ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                    }`}
                  >
                    {deleting ? 'deleting...' : 'delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showDatePicker && (
            <DatePickerModal
              isOpen={showDatePicker}
              onClose={() => setShowDatePicker(false)}
              onConfirm={(date) => {
                setSelectedDate(date)
                setShowDatePicker(false)
              }}
              initialDate={selectedDate}
            />
          )}

          {showRepaymentModal && (
            <SelectParticipants
              isOpen={showRepaymentModal}
              onClose={() => setShowRepaymentModal(false)}
              onConfirm={(ids) => {
                setRepaymentParticipantIds(ids)
                setShowRepaymentModal(false)
              }}
              participants={participants.filter((p) => p.id !== user?.id)}
              selectedIds={repaymentParticipantIds}
              payerId={null}
              allowEmpty={false}
              single={true}
            />
          )}

          {showKeypad && (
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
                canSave={true}
              />
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <ErrorToast
        message={error?.message || ''}
        isVisible={isErrorVisible}
        onClose={clearError}
        details={error?.details}
      />
    <div className="w-full max-w-md bg-background-light min-h-screen flex flex-col relative overflow-x-hidden mx-auto" style={{ height: '100%', minHeight: '100dvh' }}>
      <header className="pt-8 pb-4 px-6 flex flex-col gap-4 z-10 sticky top-0 bg-background-light/95 backdrop-blur-sm">
        <div className="flex items-center justify-between w-full">
              <button
                onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm hover:shadow-md transition-all text-text-muted hover:text-text-main"
          >
            <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-bold text-text-main">Edit Transaction</h1>
          <div className="w-10"></div>
        </div>
        <div className="w-full flex justify-center">
          <div className="bg-white p-1 rounded-full border border-gray-100 flex relative w-64 shadow-sm">
            <button
              onClick={() => setTransactionType('expense')}
              className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${
                transactionType === 'expense'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              Expense
            </button>
            <button
              onClick={() => setTransactionType('income')}
              className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${
                transactionType === 'income'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              Income
            </button>
          </div>
        </div>
      </header>

      <main 
        className="flex-1 overflow-y-auto no-scrollbar px-6"
        style={{ 
          paddingBottom: showKeypad ? '450px' : '128px',
          transition: 'padding-bottom 0.3s ease-in-out'
        }}
      >
        {/* Amount Input */}
        <div className="mt-4 mb-8 text-center relative z-[101]">
          <div className="flex items-center justify-center gap-3 mx-auto w-full max-w-[320px]">
            <span className={`text-3xl font-bold ${transactionType === 'expense' ? 'text-gray-500' : 'text-primary'}`}>$</span>
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setShouldResetAmount(true);
                setEditingAmountType('main');
                setEditingAmountId(null);
                setShowKeypad(true);
              }}
              className={`bg-white rounded-pill py-4 px-8 shadow-sm border border-gray-100 flex items-center justify-center min-w-[120px] max-w-[240px] cursor-pointer relative z-[101] break-all whitespace-pre-wrap ${
                amount.length > 12 ? 'text-2xl' : amount.length > 8 ? 'text-3xl' : amount.length > 5 ? 'text-4xl' : 'text-5xl'
              } font-bold ${
                transactionType === 'expense' ? 'text-gray-500' : 'text-primary'
              }`}
            >
              {formatAmountString(amount)}
            </div>
          </div>

          {/* Payer and Debtors - Only for Expense */}
          {transactionType === 'expense' && payerId !== DEPOSIT_PAYER_ID && (
            <div className="mt-6 flex items-center justify-center gap-4 text-sm font-medium relative z-[101]">
              <div className="flex flex-col items-center gap-1">
                <span className="text-text-muted text-xs">Payer</span>
                {payer ? (
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                    <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs overflow-hidden">
                      {payer.participant.avatar ? (
                        <img alt={payer.participant.name} src={payer.participant.avatar} className="w-full h-full object-cover" />
                      ) : (
                        <span>{payer.participant.name[0]}</span>
                      )}
                    </div>
                    <span className="text-text-main">${payer.amount.toFixed(0)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                    <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs">👤</div>
                    <span className="text-text-muted text-xs">-</span>
                  </div>
                )}
              </div>
              <span className="material-symbols-outlined text-text-muted/50 mt-4">arrow_back</span>
              <div className="flex flex-col items-center gap-1">
                <span className="text-text-muted text-xs">Debtors</span>
                {debtors.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {debtors.map((debtor) => (
                      <div
                        key={debtor.participant.id}
                        className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100"
                      >
                        <div className="h-6 w-6 rounded-full bg-primary-light flex items-center justify-center text-white text-[10px] font-bold overflow-hidden">
                          {debtor.participant.avatar ? (
                            <img alt={debtor.participant.name} src={debtor.participant.avatar} className="w-full h-full object-cover" />
                          ) : (
                            <span>{debtor.participant.name[0]}</span>
                          )}
                        </div>
                        <span className="text-text-main font-semibold">${debtor.amount.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                    <div className="h-6 w-6 rounded-full bg-primary-light flex items-center justify-center text-white text-[10px] font-bold">-</div>
                    <span className="text-text-muted text-xs">-</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* More detailed breakdown for shared expense - positioned behind keypad with blur */}
        {transactionType === 'expense' && isPublicExpense && debtors.length > 0 && payerId !== DEPOSIT_PAYER_ID && (
          <div 
            className={`px-6 w-full mt-4 mb-6 pointer-events-none transition-all duration-200 ${showKeypad ? 'opacity-40 blur-sm' : 'opacity-100'}`}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Detailed Split Details
              </div>
              <div className="flex flex-col gap-2">
                {(debtors as Array<{ participant: Participant; amount: number; publicShare?: number; personalShare?: number }>)
                  .filter((debtor) => 
                    typeof debtor.publicShare === 'number' && typeof debtor.personalShare === 'number'
                  )
                  .map((debtor) => {
                    const publicShare = typeof debtor.publicShare === 'number' ? debtor.publicShare : 0;
                    const personalShare = typeof debtor.personalShare === 'number' ? debtor.personalShare : 0;
                    return (
                      <div
                        key={`detail-${debtor.participant.id}`}
                        className="w-full flex items-center justify-between gap-3 bg-white px-3 py-2 rounded-full shadow-sm border border-gray-100"
                      >
                        <span className="text-xs font-semibold text-text-main truncate">
                          {debtor.participant.name}
                        </span>
                        <span className="text-[11px] text-text-muted whitespace-nowrap">
                          Public Share {publicShare.toFixed(0)} + Personal {personalShare.toFixed(0)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        <div 
          onClick={(e) => {
            e.stopPropagation();
            setShowKeypad(false);
          }}
          className="flex flex-col gap-4"
        >
          {/* Category */}
          <CategoryPicker
            selectedCategory={selectedCategory}
            onSelectCategory={(categoryId) => {
              setSelectedCategory(categoryId)
              setShowKeypad(false)
            }}
            onModalStateChange={setShowCreateCategoryModal}
            type={transactionType}
          />

          {/* Income mode (personal vs common fund deposit vs bonus/refund) */}
          {transactionType === 'income' && selectedCategoryName !== 'To receive from' && (
            <div className="bg-white p-5 rounded-card shadow-sm">
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
                      e.stopPropagation()
                      setShowKeypad(false)
                      setPayerModalMode('deposit')
                      setTimeout(() => setShowPayerModal(true), 100)
                    }}
                    className="flex items-center justify-between mb-5 border-b border-gray-100 pb-5 cursor-pointer"
                  >
                    <span className="text-sm font-bold text-[#657486] tracking-wide">
                      Manager/Receiver
                    </span>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const p = participants.find((x) => x.id === depositManagerId)
                        if (!p) return null
                        return (
                          <div className="size-10 rounded-full border-2 border-white ring-2 ring-primary overflow-hidden">
                            {p.avatar ? (
                              <img alt={p.name} src={p.avatar} className="rounded-full size-full object-cover" />
                            ) : (
                              <div className="rounded-full size-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                                {p.name[0]}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      <span className="material-symbols-outlined text-primary">edit</span>
                    </div>
                  </div>

                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowKeypad(false)
                      setParticipantsModalMode('deposit')
                      setTimeout(() => setShowParticipantsModal(true), 100)
                    }}
                    className="flex items-center justify-between mb-5 border-b border-gray-100 pb-5 cursor-pointer"
                  >
                    <span className="text-sm font-bold text-[#657486] tracking-wide">
                      Contributors
                    </span>
                    <div className="flex -space-x-2">
                      {depositParticipantIds.map((id, index) => {
                        const participant = participants.find((p) => p.id === id)
                        if (!participant) return null
                        return (
                          <button
                            key={id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowKeypad(false)
                              setParticipantsModalMode('deposit')
                              setTimeout(() => setShowParticipantsModal(true), 100)
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
                        )
                      })}
                    </div>
                  </div>

                  {depositParticipantIds.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                        Amounts (Optional)
                      </div>
                      <div className="flex flex-col gap-2">
                        {depositParticipantIds.map((id) => {
                          const p = participants.find((x) => x.id === id)
                          if (!p) return null
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
                                value={depositSplitAmounts[id] ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setDepositSplitAmounts((prev) => ({ ...prev, [id]: v }))
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingAmountType('depositSplit')
                                  setEditingAmountId(id)
                                  setShowKeypad(true)
                                }}
                                placeholder="Auto"
                                className="w-28 bg-background-light rounded-xl border-none py-2 px-3 text-text-main font-semibold text-right focus:ring-2 focus:ring-primary/20 placeholder-text-muted/50 transition-shadow cursor-pointer"
                                readOnly
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Note/Description */}
          <div className="bg-white p-5 rounded-card shadow-sm">
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              {transactionType === 'income' ? 'Source of income?' : 'What was this for?'}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={transactionType === 'income' ? 'Source of income?' : 'What was this for?'}
              className="w-full bg-background-light rounded-xl border-none py-3 px-4 text-text-main font-semibold focus:ring-2 focus:ring-primary/20 placeholder-text-muted/50 transition-shadow"
            />
          </div>

          {/* Shared With - Only for Expense */}
          {transactionType === 'expense' && (
            <div className="bg-white p-5 rounded-card shadow-sm">
              <div
                onClick={(e) => {
                  e.stopPropagation()
                  setShowKeypad(false)
                  setPayerModalMode('expense')
                  setTimeout(() => setShowPayerModal(true), 100)
                }}
                className={`flex items-center justify-between ${payerId !== DEPOSIT_PAYER_ID ? 'mb-5 border-b border-gray-100 pb-5' : ''} cursor-pointer`}
              >
                <span className="text-sm font-bold text-[#657486] tracking-wide">
                  Payer
                </span>
                <div className="flex items-center gap-2">
                  {(() => {
                    const p = expensePayerOptions().find((x) => x.id === payerId)
                    if (!p) return (
                      <div className="size-10 rounded-full border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400">
                        👤
                      </div>
                    )
                    return (
                      <div className="size-10 rounded-full border-2 border-white ring-2 ring-primary overflow-hidden">
                        {(p as any).avatar ? (
                          <img alt={p.name} src={p.avatar} className="rounded-full size-full object-cover" />
                        ) : (
                          <div className="rounded-full size-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                            {p.name[0]}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  <span className="material-symbols-outlined text-primary">edit</span>
                </div>
              </div>

              {payerId !== DEPOSIT_PAYER_ID && (
                <>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                Split with
              </label>
              <div className="flex items-center justify-between mb-2">
                <div className="flex -space-x-3 overflow-hidden p-1">
                  {selectedParticipantIds.map((id, index) => {
                    const participant = participants.find((p) => p.id === id)
                    if (!participant) return null
                    return (
                      <div
                        key={id}
                        className="h-10 w-10 rounded-full ring-2 ring-white bg-primary-light flex items-center justify-center text-white text-xs font-bold overflow-hidden"
                        style={{ zIndex: selectedParticipantIds.length - index }}
                      >
                        {participant.avatar ? (
                          <img alt={participant.name} src={participant.avatar} className="w-full h-full object-cover" />
                        ) : (
                          (participant.name === 'You' ? 'You' : participant.name[0])
                        )}
                      </div>
                    )
                  })}
                  {selectedParticipantIds.length === 0 && (
                    <div className="h-10 w-10 rounded-full ring-2 ring-white bg-gray-200 flex items-center justify-center text-xs">
                      👤
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowKeypad(false)
                    setParticipantsModalMode('expense')
                    setTimeout(() => setShowParticipantsModal(true), 100)
                  }}
                  className="text-primary text-sm font-semibold hover:text-primary/80 transition-colors"
                >
                  Edit
                </button>
              </div>

              {selectedParticipantIds.length > 0 && (
                <div className="mt-3 mb-4">
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Split Amounts (Optional)
                  </div>
                  <div className="flex flex-col gap-2">
                    {selectedParticipantIds.map((id) => {
                      const p = participants.find((x) => x.id === id)
                      if (!p) return null
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
                            inputMode="numeric"
                            value={customSplitAmounts[id] ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setCustomSplitAmounts((prev) => ({ ...prev, [id]: v }))
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingAmountType('customSplit')
                              setEditingAmountId(id)
                              setShowKeypad(true)
                            }}
                            placeholder="Auto"
                            className="w-28 bg-background-light rounded-xl border-none py-2 px-3 text-text-main font-semibold text-right focus:ring-2 focus:ring-primary/20 placeholder-text-muted/50 transition-shadow cursor-pointer"
                            readOnly
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Shared expense (public expense) - same UI as /add */}
              {isMultiMemberLedger && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
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
                      const next = e.target.value
                      const total = Math.ceil(parseFloat(amount) || 0)
                      if (next === '') {
                        setPublicAmount('')
                      } else {
                        const n = parseFloat(next)
                        if (isNaN(n)) {
                          if (/^[0-9]*\.?[0-9]*$/.test(next)) {
                          setPublicAmount(next)
                          }
                        } else if (total > 0) {
                          setPublicAmount(next)
                        } else {
                          setPublicAmount(next)
                        }
                      }
                      setPublicAmountManuallySet(true)
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingAmountType('publicAmount')
                      setEditingAmountId(null)
                      setShowKeypad(true)
                    }}
                    onBlur={(e) => {
                      const val = e.target.value
                      if (val === '') {
                        setPublicAmount('0')
                      } else {
                        const n = parseFloat(val)
                        if (!isNaN(n)) {
                          const total = Math.ceil(parseFloat(amount) || 0)
                          if (total > 0) {
                            setPublicAmount(Math.min(Math.ceil(n), total).toString())
                          } else {
                            setPublicAmount(Math.ceil(n).toString())
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
                        : participants.length
                      const memberCount = Math.max(1, publicShareCount || 1)
                      return Math.ceil(total / memberCount).toFixed(0)
                    })()} (Total ÷ {publicShareParticipantIds.length > 0 ? publicShareParticipantIds.length : participants.length})
                  </p>

                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                      Shared with (Shared expense)
                    </label>
                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-3 overflow-hidden p-1">
                        {publicShareParticipantIds.map((id, index) => {
                          const participant = participants.find((p) => p.id === id)
                          if (!participant) return null
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
                                <div
                                  className={`w-full h-full flex items-center justify-center text-xs font-bold ${
                                    id === payerId ? 'text-white' : 'text-gray-700'
                                  }`}
                                >
                                  {participant.name[0]}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowKeypad(false)
                          setTimeout(() => setShowPublicShareModal(true), 100)
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
          )}

          {/* Repayment Object - Only for Income when "To receive from" category is selected */}
          {transactionType === 'income' && selectedCategoryName === 'To receive from' && (
            <div className="bg-white p-5 rounded-card shadow-sm">
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
              To receive from
              </label>
              <div className="flex items-center justify-between mb-2">
                <div className="flex -space-x-3 overflow-hidden p-1">
                  {repaymentParticipantIds.map((id, index) => {
                    const participant = participants.find((p) => p.id === id)
                    if (!participant) return null
                    return (
                      <div
                        key={id}
                        className="h-10 w-10 rounded-full ring-2 ring-white bg-secondary flex items-center justify-center text-white text-xs font-bold"
                        style={{ zIndex: repaymentParticipantIds.length - index }}
                      >
                        {participant.name === 'You' ? 'You' : participant.name[0]}
                      </div>
                    )
                  })}
                  {repaymentParticipantIds.length === 0 && (
                    <div className="h-10 w-10 rounded-full ring-2 ring-white bg-gray-200 flex items-center justify-center text-xs">
                      👤
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowKeypad(false)
                    setTimeout(() => setShowRepaymentModal(true), 100)
                  }}
                  className="text-primary text-sm font-semibold hover:text-primary/80 transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          )}

          {/* Date */}
          <div className="bg-white p-5 rounded-card shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-text-muted">
                  <span className="material-symbols-outlined">calendar_today</span>
                </div>
                <div>
                  <h4 className="font-semibold text-text-main">Date</h4>
                </div>
              </div>
              <button
                onClick={() => setShowDatePicker(true)}
                className="bg-transparent border-none text-right text-text-muted font-medium focus:ring-0 p-0 text-sm"
              >
                {formatSimpleDate(selectedDate)}
              </button>
            </div>
          </div>
        </div>
      </main>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background-light via-background-light to-transparent pt-12">
        {!isViewer ? (
        <div className="flex gap-4">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex-1 h-14 bg-white text-red-500 font-bold rounded-2xl shadow-soft flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
          >
            <span className="material-symbols-outlined">delete</span>
            delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave()}
            className={`flex-1 h-14 font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-colors ${
              saving || !canSave()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary/90 shadow-primary/30'
            }`}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>saving...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">check</span>
                    save
              </>
            )}
          </button>
        </div>
        ) : (
          <div className="w-full p-4 bg-gray-100 rounded-2xl text-center text-gray-500 font-medium">
            Viewer 模式：僅供檢視，無法修改
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => {
            setShowDeleteModal(false);
          }}></div>
          <div className="relative w-full max-w-[340px] bg-white rounded-[24px] p-6 shadow-2xl flex flex-col items-center text-center transform transition-all animate-in fade-in zoom-in duration-200">
            <div className="mb-5 flex items-center justify-center size-14 rounded-full bg-red-50 text-red-500">
              <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>delete</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Confirm Deletion</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed px-2">
              Are you sure you want to delete this transaction? This action cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-4 w-full">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                }}
                className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`py-3.5 px-4 rounded-2xl font-bold text-sm shadow-lg transition-colors ${
                  deleting
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                }`}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showParticipantsModal && (
        <SelectParticipants
          isOpen={showParticipantsModal}
          onClose={() => setShowParticipantsModal(false)}
          onConfirm={(ids) => {
            if (participantsModalMode === 'deposit') {
              setDepositParticipantIds(ids)
              setDepositSplitAmounts((prev) => {
                const next: Record<string, string> = {}
                ids.forEach((id) => {
                  if (prev[id] !== undefined) next[id] = prev[id]
                })
                return next
              })
            } else {
              setSelectedParticipantIds(ids)
              setCustomSplitAmounts((prev) => {
                const next: Record<string, string> = {}
                ids.forEach((id) => {
                  if (prev[id] !== undefined) next[id] = prev[id]
                })
                return next
              })
            }
            setShowParticipantsModal(false)
          }}
          participants={participants}
          selectedIds={participantsModalMode === 'deposit' ? depositParticipantIds : selectedParticipantIds}
          payerId={(participantsModalMode === 'deposit' ? depositManagerId : (payerId || user?.id)) || null}
          allowEmpty={true}
        />
      )}

      {showPayerModal && (
        <SelectParticipants
          isOpen={showPayerModal}
          onClose={() => setShowPayerModal(false)}
          onConfirm={(ids) => {
            const nextId = ids[0] || ''
            if (payerModalMode === 'deposit') {
              setDepositManagerId(nextId)
            } else {
              setPayerId(nextId)
            }
            setShowPayerModal(false)
          }}
          participants={payerModalMode === 'expense' ? expensePayerOptions() : participants}
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
            setRepaymentParticipantIds(ids)
            setShowRepaymentModal(false)
          }}
          participants={participants.filter((p) => p.id !== user?.id)}
          selectedIds={repaymentParticipantIds}
          payerId={null}
          allowEmpty={false}
        />
      )}

      {showPublicShareModal && (
        <SelectParticipants
          isOpen={showPublicShareModal}
          onClose={() => setShowPublicShareModal(false)}
          onConfirm={(ids) => {
            setPublicShareParticipantIds(ids)
            setShowPublicShareModal(false)
          }}
          participants={participants}
          selectedIds={publicShareParticipantIds}
          payerId={payerId}
          allowEmpty={true}
        />
      )}

      {showDatePicker && (
        <DatePickerModal
          isOpen={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onConfirm={(date) => {
            setSelectedDate(date)
            setShowDatePicker(false)
          }}
          initialDate={selectedDate}
        />
      )}

      {showKeypad && (
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
      )}
    </div>
    </>
  )
}
