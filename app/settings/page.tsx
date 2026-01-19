"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLedger } from "@/contexts/LedgerContext";
import ConfirmModal from "@/components/ConfirmModal";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import * as XLSX from "xlsx";

interface Book {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  owner_id?: string;
  user_id: string;
  line_notifications_enabled?: boolean;
  created_at: string;
  imageUrl?: string;
  members?: Array<{ id: string; avatar: string; name: string }>;
}

const getBookIcon = (index: number) => {
  const icons = [
    { name: "savings", color: "bg-blue-50", textColor: "text-primary" },
    { name: "home", color: "bg-orange-50", textColor: "text-orange-400" },
    { name: "restaurant", color: "bg-green-50", textColor: "text-green-500" },
  ];
  return icons[index % icons.length];
};

interface Member {
  id: string;
  name: string;
  avatar?: string;
  role: "Owner" | "Member" | "Viewer";
  isYou?: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [bookName, setBookName] = useState("");
  const [bookDescription, setBookDescription] = useState("");
  const [lineNotifications, setLineNotifications] = useState(false);
  const [originalLineNotifications, setOriginalLineNotifications] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ full_name?: string; avatar_url?: string } | null>(null);
  const [allBooks, setAllBooks] = useState<any[]>([]);
  const [bookMembers, setBookMembers] = useState<Record<string, any[]>>({});
  const [openMemberMenu, setOpenMemberMenu] = useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showDeleteMemberModal, setShowDeleteMemberModal] = useState(false);
  const [showSelectMemberModal, setShowSelectMemberModal] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<any[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [testingNotification, setTestingNotification] = useState(false);
  // Pending changes for members (role updates only - deletions are immediate)
  const [pendingMemberRoleChanges, setPendingMemberRoleChanges] = useState<Record<string, string>>({});
  const [linkCopied, setLinkCopied] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertTitle, setAlertTitle] = useState("");
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportDatePicker, setShowExportDatePicker] = useState(false);
  const [exportStartDate, setExportStartDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [exportEndDate, setExportEndDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  });
  const [isExporting, setIsExporting] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { ledgers, activeLedger, setActiveLedger, refreshLedgers } = useLedger();

  // Helper function to show alert modal
  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setShowAlertModal(true);
  };

  // Logout function
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Logout error:', error);
        showAlert('logout failed', 'logout failed, please try again later');
        setIsLoggingOut(false);
        return;
      }

      // Clear any local storage or session storage if needed
      sessionStorage.clear();
      localStorage.clear();

      // Redirect to login page
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      window.location.href = `${siteUrl}/login`;
    } catch (error) {
      console.error('Logout exception:', error);
      showAlert('logout failed', 'logout failed, please try again later');
      setIsLoggingOut(false);
    }
  };

  const loadingRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate calls in React StrictMode
    if (loadingRef.current) return;
    loadingRef.current = true;
    
    loadAllBooks().finally(() => {
      loadingRef.current = false;
    });
  }, []);

  const loadAllBooks = async () => {
    setLoading(true);
    try {
      // Check session first
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      
      if (!session || !session.user) {
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);
      
      // Fetch current user's profile for avatar (using API client, not SQL Editor)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      
      if (profile && !profileError) {
        setCurrentUserProfile(profile);
      }

      // Fetch ledgers where user is a member
      const { data: ledgerMemberships, error: ledgerMembersError } = await supabase
        .from('ledger_members')
        .select('ledger_id')
        .eq('user_id', user.id);

      if (ledgerMembersError) {
        console.error('Error fetching ledger memberships:', ledgerMembersError);
      }

      const ledgerIds = ledgerMemberships?.map(m => m.ledger_id) || [];
      let ledgersData = null;
      
      if (ledgerIds.length > 0) {
        const { data, error: ledgersError } = await supabase
          .from('ledgers')
          .select('id, name, description, created_at, created_by')
          .in('id', ledgerIds)
          .order('created_at', { ascending: false });

        if (ledgersError) {
          console.error('Error fetching ledgers:', ledgersError);
        } else {
          ledgersData = data;
        }
      }

      // Fetch account_books where user is owner or member
      const { data: bookMemberships, error: bookMembersError } = await supabase
        .from('book_members')
        .select('book_id')
        .eq('user_id', user.id);

      if (bookMembersError) {
        console.error('Error fetching book memberships:', bookMembersError);
      }

      const bookIds = bookMemberships?.map(m => m.book_id) || [];
      let accountBooks = null;

      if (bookIds.length > 0) {
        const { data, error: booksError } = await supabase
          .from('account_books')
          .select('id, name, description, owner_id, created_at')
          .in('id', bookIds)
          .order('created_at', { ascending: false });

        if (booksError) {
          console.error('Error fetching account books:', booksError);
        } else {
          accountBooks = data;
        }
      }

      // Combine ledgers and account_books
      const combined: any[] = [];
      
      // Add ledgers from database
      if (ledgersData) {
        ledgersData.forEach(ledger => {
          combined.push({
            ...ledger,
            type: 'ledger',
            description: ledger.description || null,
          });
        });
      }

      // Add account_books
      if (accountBooks) {
        accountBooks.forEach(book => {
          combined.push({
            id: book.id,
            name: book.name,
            description: book.description || null,
            type: 'account_book',
            created_at: book.created_at,
            owner_id: book.owner_id,
          });
        });
      }

      // Sort by created_at (most recent first)
      combined.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });

      setAllBooks(combined);

      // If user has no ledgers or account_books, create a default ledger
      if (combined.length === 0) {
        try {
          const { data: newLedger, error: createError } = await supabase
            .from('ledgers')
            .insert({
              name: '我的帳本',
              description: '預設帳本',
            })
            .select('id, name, description, created_at, created_by')
            .single();

          if (!createError && newLedger) {
            // Insert default categories for ledger
            const defaultCategories = [
              { name: 'Food', icon: '🍚', type: 'Expense' },
              { name: 'Travel', icon: '🚗', type: 'Expense' },
              { name: 'Shop', icon: '🛍️', type: 'Expense' },
              { name: 'Rent', icon: '🏠', type: 'Expense' },
              { name: 'Fun', icon: '🎮', type: 'Expense' },
              { name: 'Salary', icon: '💰', type: 'Income' },
              { name: 'Business', icon: '💼', type: 'Income' },
              { name: 'Gift', icon: '🎁', type: 'Income' },
              { name: 'Investment', icon: '📈', type: 'Income' },
              { name: 'To receive from', icon: '🤝', type: 'Income' },
            ];

            const categoryRecords = defaultCategories.map(cat => ({
              ledger_id: newLedger.id,
              name: cat.name,
              icon: cat.icon,
              type: cat.type,
            }));

            const { error: categoriesError } = await supabase
              .from('categories')
              .insert(categoryRecords);

            if (categoriesError) {
              console.error('Error creating default categories:', categoriesError);
              // Don't fail the whole operation, just log the error
            }

            // Add to combined list
            combined.push({
              ...newLedger,
              type: 'ledger',
              description: newLedger.description || null,
            });
            setAllBooks(combined);
            
            // Set as active ledger
            const newLedgerItem = {
              id: newLedger.id,
              name: newLedger.name,
              description: newLedger.description || null,
              type: 'ledger' as const,
              created_at: newLedger.created_at,
              created_by: newLedger.created_by,
            };
            setActiveLedger(newLedgerItem);
            
            // Refresh ledgers in context
            await refreshLedgers();
          }
        } catch (error) {
          // Silent fail - user can create manually
        }
      } else {
        // If user has ledgers but no activeLedger, set the first one as active
        if (!activeLedger && combined.length > 0) {
          const firstBook = {
            id: combined[0].id,
            name: combined[0].name,
            description: combined[0].description || null,
            type: combined[0].type || 'ledger' as const,
            created_at: combined[0].created_at,
            created_by: combined[0].created_by || combined[0].owner_id,
          };
          setActiveLedger(firstBook);
        }
      }

      // Load members for each book
      const membersMap: Record<string, any[]> = {};
      for (const book of combined) {
        if (book.type === 'ledger') {
          // Load ledger members
          const { data: members, error: membersError } = await supabase
            .from('ledger_members')
            .select('user_id, role')
            .eq('ledger_id', book.id);
          
          if (membersError) {
            console.error('Error fetching ledger members:', membersError);
          }

          if (members && members.length > 0) {
            // Fetch profiles for all members
            const userIds = members.map(m => m.user_id);
            const { data: profiles, error: profilesError } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url')
              .in('id', userIds);
            
            if (profilesError) {
              console.error('Error fetching profiles:', profilesError);
            }

            // Map members with their profiles
            membersMap[book.id] = members.map((m: any) => {
              const profile = profiles?.find(p => p.id === m.user_id);
              const memberData = {
                id: m.user_id,
                name: profile?.full_name || 'Unknown',
                avatar: profile?.avatar_url || '',
                role: m.role,
              };
              return memberData;
            });
          }
        } else {
          // Load account_book members
          const { data: members, error: membersError } = await supabase
            .from('book_members')
            .select('user_id, role')
            .eq('book_id', book.id);
          
          if (membersError) {
            console.error('Error fetching book members:', membersError);
          }

          if (members && members.length > 0) {
            // Fetch profiles for all members
            const userIds = members.map(m => m.user_id);
            const { data: profiles, error: profilesError } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url')
              .in('id', userIds);
            
            if (profilesError) {
              console.error('Error fetching profiles:', profilesError);
            }

            // Map members with their profiles
            membersMap[book.id] = members.map((m: any) => {
              const profile = profiles?.find(p => p.id === m.user_id);
              const memberData = {
                id: m.user_id,
                name: profile?.full_name || 'Unknown',
                avatar: profile?.avatar_url || '',
                role: m.role,
              };
              return memberData;
            });
          }
        }
      }
      setBookMembers(membersMap);
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteModal = (book: Book) => {
    setSelectedBook(book);
    setShowDeleteModal(true);
  };

  // Export to Excel function
  const handleExportToExcel = async () => {
    // Use selectedBook if in member modal, otherwise use activeLedger
    const targetBook = selectedBook || activeLedger;
    
    if (!targetBook?.id) {
      showAlert('Error', 'Please select an account book first');
      return;
    }

    setIsExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showAlert('Error', 'Please login first');
        setIsExporting(false);
        return;
      }

      const ledgerId = targetBook.id;
      const ledgerType = targetBook.type;
      const scopeColumn = ledgerType === 'account_book' ? 'book_id' : 'ledger_id';
      const startDateStr = exportStartDate.toISOString().split('T')[0];
      const endDateStr = exportEndDate.toISOString().split('T')[0];

      // Fetch all participants for name mapping
      const { data: participants } = await supabase
        .from(ledgerType === 'account_book' ? 'book_members' : 'ledger_members')
        .select('user_id, profiles(id, full_name)')
        .eq(ledgerType === 'account_book' ? 'book_id' : 'ledger_id', ledgerId);

      const participantMap = new Map<string, string>();
      (participants || []).forEach((p: any) => {
        participantMap.set(p.user_id, p.profiles?.full_name || 'Unknown');
      });

      // Fetch all transactions (expenses and incomes)
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select(`
          id,
          date,
          type,
          amount,
          description,
          payer_id,
          category_id,
          expense_payment_source,
          income_mode,
          is_public_expense,
          public_amount,
          categories (id, name, icon),
          payer:profiles!transactions_payer_id_fkey (id, full_name)
        `)
        .eq(scopeColumn, ledgerId)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (txError) {
        console.error('Error fetching transactions:', txError);
        showAlert('Error', 'Failed to fetch transactions');
        setIsExporting(false);
        return;
      }

      // Fetch all transaction splits
      const { data: splits, error: splitsError } = await supabase
        .from('transaction_splits')
        .select('transaction_id, user_id, amount')
        .eq(scopeColumn, ledgerId)
        .in('transaction_id', (transactions || []).map(tx => tx.id));

      if (splitsError) {
        console.error('Error fetching splits:', splitsError);
      }

      // Group splits by transaction_id
      const splitsByTx = new Map<string, Array<{ user_id: string; amount: number }>>();
      (splits || []).forEach((split: any) => {
        if (!splitsByTx.has(split.transaction_id)) {
          splitsByTx.set(split.transaction_id, []);
        }
        splitsByTx.get(split.transaction_id)!.push({
          user_id: split.user_id,
          amount: Number(split.amount || 0)
        });
      });

      // Fetch settlements
      const { data: settlements, error: settlementsError } = await supabase
        .from('settlements')
        .select(`
          id,
          date,
          amount,
          note,
          sender_id,
          receiver_id,
          sender:profiles!settlements_sender_id_fkey (id, full_name),
          receiver:profiles!settlements_receiver_id_fkey (id, full_name)
        `)
        .eq('ledger_id', ledgerId)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: false });

      if (settlementsError) {
        console.error('Error fetching settlements:', settlementsError);
      }

      // Prepare data for Excel
      const expenses: any[] = [];
      const incomes: any[] = [];
      const categoryTotals = new Map<string, { amount: number; count: number }>();

      (transactions || []).forEach((tx: any) => {
        const date = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const payerName = tx.payer?.full_name || participantMap.get(tx.payer_id) || 'Unknown';
        const categoryName = tx.categories?.name || 'Other';
        const amount = Number(tx.amount || 0);
        const splits = splitsByTx.get(tx.id) || [];
        const splitDetails = splits.map(s => `${participantMap.get(s.user_id) || 'Unknown'}: $${s.amount.toFixed(2)}`).join('; ');
        const publicAmount = tx.is_public_expense ? (Number(tx.public_amount || 0) || amount) : 0;

        // Update category totals
        if (!categoryTotals.has(categoryName)) {
          categoryTotals.set(categoryName, { amount: 0, count: 0 });
        }
        const catTotal = categoryTotals.get(categoryName)!;
        catTotal.amount += amount;
        catTotal.count += 1;

        if (tx.type === 'expense') {
          expenses.push({
            Date: date,
            Payer: payerName,
            Category: categoryName,
            Note: tx.description || '',
            Amount: amount,
            'Split Details': splitDetails,
            'Public Fund Amount': tx.is_public_expense ? publicAmount : 0
          });
        } else if (tx.type === 'income') {
          incomes.push({
            Date: date,
            Payer: payerName,
            Category: categoryName,
            Note: tx.description || '',
            Amount: amount,
            Type: tx.income_mode === 'deposit' ? 'Top-up' : tx.income_mode === 'bonus' ? 'Bonus' : tx.income_mode === 'refund' ? 'Refund' : 'Income'
          });
        }
      });

      // Add repayments to incomes
      (settlements || []).forEach((s: any) => {
        const date = new Date(s.date || s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const senderName = s.sender?.full_name || participantMap.get(s.sender_id) || 'Unknown';
        const receiverName = s.receiver?.full_name || participantMap.get(s.receiver_id) || 'Unknown';
        incomes.push({
          Date: date,
          Payer: senderName,
          Category: 'Repayment',
          Note: s.note || `Repayment from ${senderName} to ${receiverName}`,
          Amount: Number(s.amount || 0),
          Type: 'Repayment'
        });
      });

      // Calculate previous period for comparison
      const periodDays = Math.ceil((exportEndDate.getTime() - exportStartDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevStartDate = new Date(exportStartDate);
      prevStartDate.setDate(prevStartDate.getDate() - periodDays - 1);
      const prevEndDate = new Date(exportStartDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevStartDateStr = prevStartDate.toISOString().split('T')[0];
      const prevEndDateStr = prevEndDate.toISOString().split('T')[0];

      // Fetch previous period transactions for comparison
      const { data: prevTransactions } = await supabase
        .from('transactions')
        .select('amount, category_id, type, categories (name)')
        .eq(scopeColumn, ledgerId)
        .gte('date', prevStartDateStr)
        .lte('date', prevEndDateStr);

      const prevCategoryTotals = new Map<string, number>();
      (prevTransactions || []).forEach((tx: any) => {
        const categoryName = tx.categories?.name || 'Other';
        const amount = Number(tx.amount || 0);
        prevCategoryTotals.set(categoryName, (prevCategoryTotals.get(categoryName) || 0) + amount);
      });

      // Prepare summary data
      const totalExpense = expenses.reduce((sum, e) => sum + e.Amount, 0);
      const totalIncome = incomes.reduce((sum, i) => sum + i.Amount, 0);
      const summary: any[] = [];
      
      // Add category breakdown
      const sortedCategories = Array.from(categoryTotals.entries())
        .sort((a, b) => b[1].amount - a[1].amount);

      sortedCategories.forEach(([category, data]) => {
        const percentage = totalExpense > 0 ? ((data.amount / totalExpense) * 100).toFixed(2) : '0.00';
        const prevAmount = prevCategoryTotals.get(category) || 0;
        const comparison = prevAmount > 0 ? (((data.amount - prevAmount) / prevAmount) * 100).toFixed(2) : 'N/A';
        summary.push({
          Category: category,
          'Total Amount': data.amount,
          'Percentage (%)': `${percentage}%`,
          'Transaction Count': data.count,
          'Comparison (%)': comparison !== 'N/A' ? `${comparison}%` : 'N/A'
        });
      });

      // Add totals row
      summary.push({
        Category: 'TOTAL',
        'Total Amount': totalExpense,
        'Percentage (%)': '100.00%',
        'Transaction Count': expenses.length,
        'Comparison (%)': 'N/A'
      });

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Sheet 1: Expenses
      const wsExpenses = XLSX.utils.json_to_sheet(expenses);
      wsExpenses['!cols'] = [
        { wch: 12 }, // Date
        { wch: 15 }, // Payer
        { wch: 15 }, // Category
        { wch: 25 }, // Note
        { wch: 12 }, // Amount
        { wch: 30 }, // Split Details
        { wch: 18 }  // Public Fund Amount
      ];
      XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses');

      // Sheet 2: Incomes & Top-ups
      const wsIncomes = XLSX.utils.json_to_sheet(incomes);
      wsIncomes['!cols'] = [
        { wch: 12 }, // Date
        { wch: 15 }, // Payer
        { wch: 15 }, // Category
        { wch: 25 }, // Note
        { wch: 12 }, // Amount
        { wch: 12 }  // Type
      ];
      XLSX.utils.book_append_sheet(wb, wsIncomes, 'Incomes & Top-ups');

      // Sheet 3: Summary
      const wsSummary = XLSX.utils.json_to_sheet(summary);
      wsSummary['!cols'] = [
        { wch: 15 }, // Category
        { wch: 15 }, // Total Amount
        { wch: 15 }, // Percentage
        { wch: 18 }, // Transaction Count
        { wch: 15 }  // Comparison
      ];
      
      // Make total row bold (Note: xlsx library has limited style support)
      // We'll add a visual indicator by prefixing with "TOTAL: " in the Category column
      // For better styling, consider using xlsx-js-style or exceljs library
      const totalRowIndex = summary.length - 1; // Last row is the total
      const range = XLSX.utils.decode_range(wsSummary['!ref'] || 'A1');
      // Try to apply styles (may not work in all Excel versions)
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: totalRowIndex, c: col });
        if (!wsSummary[cellAddress]) {
          // Create cell if it doesn't exist
          wsSummary[cellAddress] = { v: summary[totalRowIndex][Object.keys(summary[totalRowIndex])[col]] || '' };
        }
        // Apply style (limited support in xlsx)
        if (!wsSummary[cellAddress].s) {
          wsSummary[cellAddress].s = {};
        }
        wsSummary[cellAddress].s.font = { bold: true };
        wsSummary[cellAddress].s.fill = { fgColor: { rgb: 'E0E0E0' } };
      }

      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      // Generate filename
      const fileName = `${targetBook.name}_${startDateStr}_to_${endDateStr}.xlsx`;

      // Write file
      XLSX.writeFile(wb, fileName);

      setShowExportModal(false);
      showAlert('Success', 'Excel file exported successfully!');
    } catch (error: any) {
      console.error('Export error:', error);
      showAlert('Error', `Export failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteBook = async () => {
    if (!selectedBook) return;
    
    // 保存要刪除的帳本信息
    const bookToDelete = selectedBook;
    
    // 等待約1秒後關閉彈窗，給用戶視覺反饋
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setShowDeleteModal(false);
    setSelectedBook(null);
    
    try {
      if (bookToDelete.type === 'ledger') {
        // Delete ledger
        const { error } = await supabase
          .from('ledgers')
          .delete()
          .eq('id', bookToDelete.id);

        if (error) throw error;
      } else {
        // Delete account_book
        const { error } = await supabase
          .from('account_books')
          .delete()
          .eq('id', bookToDelete.id);

        if (error) throw error;
      }

      // If deleted book was active, set next one as active
      const wasActive = activeLedger?.id === bookToDelete.id;
      const remainingBooks = allBooks.filter(b => b.id !== bookToDelete.id);
      
      if (wasActive && remainingBooks.length > 0) {
        setActiveLedger(remainingBooks[0]);
      } else if (wasActive && remainingBooks.length === 0) {
        setActiveLedger(null);
      }

      // Refresh the list
      await refreshLedgers();
      await loadAllBooks();
      
      // After refresh, check if user has no ledgers/books and create default one
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userLedgers } = await supabase
          .from('ledger_members')
          .select('ledger_id')
          .eq('user_id', user.id);
        
        const { data: userBooks } = await supabase
          .from('book_members')
          .select('book_id')
          .eq('user_id', user.id);
        
        const hasLedgers = userLedgers && userLedgers.length > 0;
        const hasBooks = userBooks && userBooks.length > 0;
        
        if (!hasLedgers && !hasBooks) {
          // User has no ledgers/books, create default ledger
          console.log('User has no ledgers after deletion, creating default ledger...');
          const { data: newLedger, error: createError } = await supabase
            .from('ledgers')
            .insert({
              name: '我的帳本',
              description: '預設帳本',
            })
            .select('id, name, description, created_at, created_by')
            .single();

          if (createError) {
            console.error('Error creating default ledger after deletion:', createError);
          } else if (newLedger) {
            // Insert default categories for ledger
            const defaultCategories = [
              { name: 'Food', icon: '🍱', type: 'Expense' },
              { name: 'Travel', icon: '🚌', type: 'Expense' },
              { name: 'Shop', icon: '🛍️', type: 'Expense' },
              { name: 'Rent', icon: '🏠', type: 'Expense' },
              { name: 'Fun', icon: '🎮', type: 'Expense' },
              { name: 'Salary', icon: '💰', type: 'Income' },
              { name: 'Business', icon: '💼', type: 'Income' },
              { name: 'Gift', icon: '🎁', type: 'Income' },
              { name: 'Investment', icon: '📈', type: 'Income' },
              { name: 'To receive from', icon: '🤝', type: 'Income' },
            ];

            const categoryRecords = defaultCategories.map(cat => ({
              ledger_id: newLedger.id,
              name: cat.name,
              icon: cat.icon,
              type: cat.type,
            }));

            const { error: categoriesError } = await supabase
              .from('categories')
              .insert(categoryRecords);

            if (categoriesError) {
              console.error('Error creating default categories:', categoriesError);
            }

            console.log('Default ledger created after deletion:', newLedger);
            // Refresh again to get the new ledger
            await refreshLedgers();
            await loadAllBooks();
            // Set the new ledger as active
            const newLedgerItem = {
              id: newLedger.id,
              name: newLedger.name,
              description: newLedger.description || null,
              created_at: newLedger.created_at,
              type: 'ledger' as const,
            };
            setActiveLedger(newLedgerItem);
          }
        }
      }
    } catch (error) {
      console.error('Error deleting book:', error);
      showAlert('error', 'delete book failed, please try again');
    }
  };

  const openMemberModal = async (book: any) => {
    setSelectedBook(book);
    setBookName(book.name);
    setBookDescription(book.description || "");
    setShowMemberModal(true);
    
    // Load current user's notification setting
    if (currentUserId) {
      if (book.type === 'ledger') {
        // For ledgers, use ledger_members.line_notifications_enabled
        const { data: memberData, error } = await supabase
          .from('ledger_members')
          .select('line_notifications_enabled')
          .eq('ledger_id', book.id)
          .eq('user_id', currentUserId)
          .single();
        
        if (!error && memberData) {
          const notificationValue = memberData.line_notifications_enabled || false;
          setLineNotifications(notificationValue);
          setOriginalLineNotifications(notificationValue);
        } else {
          setLineNotifications(false);
          setOriginalLineNotifications(false);
        }
      } else {
        // For account_books, use book_members.is_notify_enabled
        const { data: memberData, error } = await supabase
          .from('book_members')
          .select('is_notify_enabled')
          .eq('book_id', book.id)
          .eq('user_id', currentUserId)
          .single();
        
        if (!error && memberData) {
          const notificationValue = memberData.is_notify_enabled || false;
          setLineNotifications(notificationValue);
          setOriginalLineNotifications(notificationValue);
        } else {
          setLineNotifications(false);
          setOriginalLineNotifications(false);
        }
      }
    } else {
      setLineNotifications(false);
      setOriginalLineNotifications(false);
    }
  };

  const handleUpdateBook = async () => {
    console.log('handleUpdateBook called', { selectedBook, bookName, bookDescription });
    
    if (!selectedBook) {
      console.error('No selected book');
      return;
    }
    
    if (!selectedBook.name?.trim() && !bookName?.trim()) {
      console.error('Book name is required');
      return;
    }
    
    try {
      const updateData: any = {
        name: (selectedBook.name || bookName || '').trim(),
        description: (selectedBook.description || bookDescription || '').trim() || null,
      };

      console.log('Updating book with data:', updateData);

      if (selectedBook.type === 'ledger') {
        const { data, error } = await supabase
          .from('ledgers')
          .update(updateData)
          .eq('id', selectedBook.id)
          .select();

        if (error) {
          console.error('Error updating ledger:', error);
          throw error;
        }
        console.log('Ledger updated successfully:', data);

        // Update notification setting for current user
        if (currentUserId) {
          const { error: notificationError } = await supabase
            .from('ledger_members')
            .update({ line_notifications_enabled: lineNotifications })
            .eq('ledger_id', selectedBook.id)
            .eq('user_id', currentUserId);

          if (notificationError) {
            console.error('Error updating notification setting:', notificationError);
            // Don't throw error, just log it
          } else {
            setOriginalLineNotifications(lineNotifications);
          }
        }
      } else {
        // For account_books, notification settings are stored in book_members
        const { data, error } = await supabase
          .from('account_books')
          .update(updateData)
          .eq('id', selectedBook.id)
          .select();

        // Update notification setting for current user
        if (currentUserId) {
          const { error: notificationError } = await supabase
            .from('book_members')
            .update({ is_notify_enabled: lineNotifications })
            .eq('book_id', selectedBook.id)
            .eq('user_id', currentUserId);

          if (notificationError) {
            console.error('Error updating notification setting:', notificationError);
            // Don't throw error, just log it
          } else {
            setOriginalLineNotifications(lineNotifications);
          }
        }

        if (error) {
          console.error('Error updating account book:', error);
          throw error;
        }
        console.log('Account book updated successfully:', data);
      }

      // Apply pending member role changes
      if (Object.keys(pendingMemberRoleChanges).length > 0) {
        if (selectedBook.type === 'ledger') {
          for (const [memberId, newRole] of Object.entries(pendingMemberRoleChanges)) {
            const { error } = await supabase
              .from('ledger_members')
              .update({ role: newRole })
              .eq('ledger_id', selectedBook.id)
              .eq('user_id', memberId);
            
            if (error) {
              console.error(`Error updating member role for ${memberId}:`, error);
            }
          }
        } else {
          // For account_books, update role in book_members table
          for (const [memberId, newRole] of Object.entries(pendingMemberRoleChanges)) {
            const { error } = await supabase
              .from('book_members')
              .update({ role: newRole })
              .eq('book_id', selectedBook.id)
              .eq('user_id', memberId);
            
            if (error) {
              console.error(`Error updating member role for ${memberId}:`, error);
            }
          }
        }
      }

      // Apply pending member role changes (deletions are now immediate, not pending)
      // Clear pending changes
      setPendingMemberRoleChanges({});

      // Refresh the lists
      await refreshLedgers();
      await loadAllBooks();
      
      // Close modal
      setShowMemberModal(false);
      setSelectedBook(null);
    } catch (error: any) {
      console.error('Error updating book:', error);
    }
  };

  const getMembers = (book: any): Member[] => {
    if (!book) return [];
    
    const membersFromDB = bookMembers[book.id] || [];
    let members: Member[] = membersFromDB.map((m: any) => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar || '',
      role: m.role || (m.id === currentUserId || m.id === book.owner_id || m.id === book.created_by ? "Owner" : "Member"),
      isYou: m.id === currentUserId,
    }));

    // Apply pending role changes
    members = members.map(m => ({
      ...m,
      role: (pendingMemberRoleChanges[m.id] as "Owner" | "Member" | "Viewer") || m.role
    }));

    // Note: Deletions are now immediate, so we don't need to filter pending deletions

    // Ensure current user is included if not already in the list
    if (currentUserId && !members.find(m => m.id === currentUserId)) {
      // Get current user's profile from bookMembers if available, otherwise use default
      const currentUserMember = Object.values(bookMembers).flat().find((m: any) => m.id === currentUserId);
      members.push({
        id: currentUserId,
        name: currentUserMember?.name || 'You',
        avatar: currentUserMember?.avatar || '',
        role: (book.owner_id === currentUserId || book.created_by === currentUserId) ? "Owner" : "Member",
        isYou: true,
      });
    }

    return members;
  };

  // Get current user's role in the selected book
  const getCurrentUserRole = (book: any): "Owner" | "Member" | "Viewer" | null => {
    if (!book || !currentUserId) return null;
    
    const members = getMembers(book);
    const currentUser = members.find(m => m.id === currentUserId);
    return currentUser?.role || null;
  };

  // Check if current user can modify a member's role
  const canModifyMember = (book: any, member: Member): boolean => {
    if (!book || !currentUserId) return false;
    
    const currentUserRole = getCurrentUserRole(book);
    
    // Only Owner can modify roles
    if (currentUserRole !== 'Owner') {
      return false;
    }
    
    // Cannot modify Owner's role (even if current user is Owner)
    if (member.role === 'Owner') {
      return false;
    }
    
    return true;
  };

  const handleUpdateMemberRole = (memberId: string, newRole: string) => {
    // Store the change in pending changes, don't save to database yet
    setPendingMemberRoleChanges(prev => ({
      ...prev,
      [memberId]: newRole
    }));
    setOpenMemberMenu(null);
  };

  const handleDeleteMember = async () => {
    // Delete member immediately (not pending)
    if (!selectedBook || !memberToDelete) return;
    
    try {
      if (selectedBook.type === 'ledger') {
        const { error } = await supabase
          .from('ledger_members')
          .delete()
          .eq('ledger_id', selectedBook.id)
          .eq('user_id', memberToDelete.id);
        
        if (error) {
          console.error('Error deleting member:', error);
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('book_members')
          .delete()
          .eq('book_id', selectedBook.id)
          .eq('user_id', memberToDelete.id);
        
        if (error) {
          console.error('Error deleting member:', error);
          throw error;
        }
      }
      
      // Immediately refresh data so the member disappears from dropdowns
      await loadAllBooks();
      await refreshLedgers();
      
      // Update local state to reflect the deletion immediately
      if (bookMembers[selectedBook.id]) {
        setBookMembers(prev => ({
          ...prev,
          [selectedBook.id]: prev[selectedBook.id].filter((m: any) => m.id !== memberToDelete.id)
        }));
      }
      
      setShowDeleteMemberModal(false);
      setMemberToDelete(null);
      setOpenMemberMenu(null);
    } catch (error) {
      console.error('Error deleting member:', error);
      // Optionally show an error message to the user
    }
  };

  const handleInviteMember = async () => {
    // If in create modal, show member selection
    if (showCreateModal) {
      await loadAvailableMembers();
      setShowSelectMemberModal(true);
      return;
    }
    
    // If in member management modal, show member selection
    if (selectedBook) {
      await loadAvailableMembers();
      setShowSelectMemberModal(true);
      return;
    }
  };

  const handleShareInviteLink = () => {
    if (!selectedBook) return;

    // Generate invite link based on book type
    let inviteLink: string;
    
    if (selectedBook.type === 'ledger') {
      inviteLink = `${window.location.origin}/invite?ledger=${selectedBook.id}`;
    } else {
      inviteLink = `${window.location.origin}/invite?book=${selectedBook.id}`;
    }
    
    // Simply copy to clipboard
    copyToClipboard(inviteLink);
  };

  const loadAvailableMembers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all members from all ledgers and account_books the user is part of
      const [ledgerMemberships, bookMemberships] = await Promise.all([
        supabase
          .from('ledger_members')
          .select('user_id, ledger_id')
          .eq('user_id', user.id),
        supabase
          .from('book_members')
          .select('user_id, book_id')
          .eq('user_id', user.id),
      ]);

      const ledgerIds = ledgerMemberships.data?.map(m => m.ledger_id) || [];
      const bookIds = bookMemberships.data?.map(m => m.book_id) || [];

      if (ledgerIds.length === 0 && bookIds.length === 0) {
        setAvailableMembers([]);
        return;
      }

      // Get all members from these ledgers and books
      const [ledgerMembers, bookMembers] = await Promise.all([
        ledgerIds.length > 0
          ? supabase
              .from('ledger_members')
              .select('user_id')
              .in('ledger_id', ledgerIds)
          : { data: [], error: null },
        bookIds.length > 0
          ? supabase
              .from('book_members')
              .select('user_id')
              .in('book_id', bookIds)
          : { data: [], error: null },
      ]);

      // Combine and get unique user IDs
      const allMemberIds = [
        ...(ledgerMembers.data?.map(m => m.user_id) || []),
        ...(bookMembers.data?.map(m => m.user_id) || []),
      ];
      const userIds = [...new Set(allMemberIds)].filter(id => id !== user.id);

      // If in member management modal, exclude members already in the selected book
      if (selectedBook && !showCreateModal) {
        const currentMemberIds = getMembers(selectedBook).map(m => m.id);
        const filteredUserIds = userIds.filter(id => !currentMemberIds.includes(id));
        
        if (filteredUserIds.length === 0) {
          setAvailableMembers([]);
          return;
        }

        // Get profiles for these users
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', filteredUserIds);

        setAvailableMembers(profiles || []);
        return;
      }

      if (userIds.length === 0) {
        setAvailableMembers([]);
        return;
      }

      // Get profiles for these users
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);

      setAvailableMembers(profiles || []);
    } catch (error) {
      console.error('Error loading available members:', error);
      setAvailableMembers([]);
    }
  };

  const handleAddSelectedMembers = async () => {
    if (selectedMemberIds.length === 0) {
      setShowSelectMemberModal(false);
      setSelectedMemberIds([]);
      return;
    }
    
    // If in create modal, store selected member IDs - they will be added when the book is created
    if (showCreateModal) {
      setShowSelectMemberModal(false);
      return;
    }
    
    // If in member management modal, add members to the existing book
    if (selectedBook) {
      try {
        if (selectedBook.type === 'ledger') {
          // Add members to ledger
          const memberRecords = selectedMemberIds.map(userId => ({
            ledger_id: selectedBook.id,
            user_id: userId,
            role: 'Member',
          }));

          const { error: membersError } = await supabase
            .from('ledger_members')
            .insert(memberRecords);

          if (membersError) {
            console.error('Error adding members:', membersError);
            showAlert('Error', 'add member failed, please try again');
            return;
          }
        } else {
          // Add members to account_book
          const memberRecords = selectedMemberIds.map(userId => ({
            book_id: selectedBook.id,
            user_id: userId,
            role: 'Member',
          }));

          const { error: membersError } = await supabase
            .from('book_members')
            .insert(memberRecords);

          if (membersError) {
            console.error('Error adding members:', membersError);
            showAlert('Error', 'add member failed, please try again');
            return;
          }
        }
        
        // Refresh the member list
        await loadAllBooks();
        setShowSelectMemberModal(false);
        setSelectedMemberIds([]);
      } catch (error) {
        console.error('Error adding members:', error);
        showAlert('Error', 'add member failed, please try again');
      }
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setLinkCopied(true);
      setTimeout(() => {
        setLinkCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedBook) return;
    
    if (memberId === currentUserId || memberId === "user1") {
      showAlert('Warning', 'you cannot remove yourself from the book');
      return;
    }

    try {
      const { error } = await supabase
        .from('book_members')
        .delete()
        .eq('book_id', selectedBook.id)
        .eq('user_id', memberId);

      if (error) {
        console.error('Error removing member:', error);
        showAlert('Error', 'remove member failed, please try again');
        return;
      }

      // Refresh members after removal
      await loadAllBooks();
      
      // Update selected book if it's still selected
      const updatedBook = allBooks.find((b) => b.id === selectedBook.id);
      if (updatedBook) {
        setSelectedBook(updatedBook);
      }
    } catch (error) {
      console.error('Error removing member:', error);
      showAlert('Error', 'remove member failed, please try again');
    }
  };

  const [creatingLedger, setCreatingLedger] = useState(false);

  const handleCreateLedger = async () => {
    if (!bookName.trim() || creatingLedger) return;

    setCreatingLedger(true);
    try {
      // Check user session
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('Error getting user:', userError);
        showAlert('Error', `validation error: ${userError.message}`);
        setCreatingLedger(false);
        return;
      }

      if (!user) {
        showAlert('Warning', 'please login to create a book');
        setCreatingLedger(false);
        return;
      }

      console.log('Creating ledger with user:', user.id);
      console.log('bookName:', bookName);
      console.log('bookDescription (raw):', bookDescription);
      console.log('bookDescription (trimmed):', bookDescription.trim());
      console.log('bookDescription (final):', bookDescription.trim() || null);

      // Prepare insert data - always include description field
      const trimmedDescription = bookDescription.trim();
      
      // Create account_book (not ledger)
      const { data: newBook, error: bookError } = await supabase
        .from('account_books')
        .insert({
          name: bookName.trim(),
          description: trimmedDescription || null,
          owner_id: user.id,
          is_active: false,
        })
        .select('id, name, description, created_at, owner_id')
        .single();

      if (bookError) {
        console.error('Error creating account book:', bookError);
        showAlert('Error', `create book failed: ${bookError.message}`);
        setCreatingLedger(false);
        return;
      }

      // Insert default categories for account_book
      if (newBook) {
        const defaultCategories = [
          { name: 'Food', icon: '🍱', type: 'Expense' },
          { name: 'Travel', icon: '🚌', type: 'Expense' },
          { name: 'Shop', icon: '🛍️', type: 'Expense' },
          { name: 'Rent', icon: '🏠', type: 'Expense' },
          { name: 'Fun', icon: '🎮', type: 'Expense' },
          { name: 'Salary', icon: '💰', type: 'Income' },
          { name: 'Business', icon: '💼', type: 'Income' },
          { name: 'Gift', icon: '🎁', type: 'Income' },
          { name: 'Investment', icon: '📈', type: 'Income' },
          { name: 'To receive from', icon: '🤝', type: 'Income' },
        ];

        const categoryRecords = defaultCategories.map(cat => ({
          book_id: newBook.id,
          name: cat.name,
          icon: cat.icon,
          type: cat.type,
        }));

        const { error: categoriesError, data: insertedCategories } = await supabase
          .from('categories')
          .insert(categoryRecords)
          .select('id');

        if (categoriesError) {
          console.error('Error creating default categories:', categoriesError);
          showAlert('Warning', `create default categories failed: ${categoriesError.message}`);
        } else {
          console.log(`successfully created ${insertedCategories?.length || 0} default categories`);
        }
      }

      // Add owner to book_members with notification setting
      // First check if owner already exists (might be created by trigger)
      if (newBook) {
        // Wait a bit for any database triggers to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const { data: existingOwner, error: checkError } = await supabase
          .from('book_members')
          .select('is_notify_enabled')
          .eq('book_id', newBook.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          // PGRST116 is "not found" which is fine, log other errors
          console.error('Error checking existing owner:', checkError);
        }

        if (existingOwner) {
          // Owner already exists, update notification setting
          const { error: updateError } = await supabase
            .from('book_members')
            .update({ is_notify_enabled: lineNotifications })
            .eq('book_id', newBook.id)
            .eq('user_id', user.id);

          if (updateError) {
            console.error('Error updating owner notification setting:', updateError);
            // Don't show alert, just log - the book was created successfully
          } else {
            console.log('Owner notification setting updated:', lineNotifications);
          }
        } else {
          // Owner doesn't exist, insert new record
          // Note: book_members table has role column as NOT NULL, so we must include it
          const ownerMember: any = {
            book_id: newBook.id,
            user_id: user.id,
            role: 'Owner',
            is_notify_enabled: lineNotifications,
          };

          const { error: ownerError } = await supabase
            .from('book_members')
            .insert(ownerMember);

          if (ownerError) {
            console.error('Error adding owner to book_members:', ownerError);
            // If is_notify_enabled column doesn't exist, try without it
            if (ownerError.message?.includes('is_notify_enabled') || ownerError.code === 'PGRST204') {
              const ownerMemberWithoutNotify = {
                book_id: newBook.id,
                user_id: user.id,
                role: 'Owner',
              };
              const { error: retryError } = await supabase
                .from('book_members')
                .insert(ownerMemberWithoutNotify);
              if (retryError) {
                console.error('Error adding owner to book_members (retry):', retryError);
              } else {
                console.log('Owner added to book_members (without notification setting - column may not exist)');
              }
            }
            // Don't show alert - the book was created successfully
          } else {
            console.log('Owner added to book_members with notification setting:', lineNotifications);
          }
        }
      }

      // Add selected members to the new book
      if (selectedMemberIds.length > 0 && newBook) {
        const memberRecords = selectedMemberIds.map(userId => ({
          book_id: newBook.id,
          user_id: userId,
          role: 'Member',
          is_notify_enabled: false, // New members default to no notifications
        }));

        const { error: membersError } = await supabase
          .from('book_members')
          .insert(memberRecords);

        if (membersError) {
          console.error('Error adding members:', membersError);
          // Don't fail the whole operation, just log the error
        }
      }

      // Wait a bit for database to sync
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh ledgers in context and reload all books
      await refreshLedgers();
      await loadAllBooks();
      
      // Set the newly created book as active
      if (newBook) {
        const newBookItem = {
          id: newBook.id,
          name: newBook.name,
          description: newBook.description || null,
          created_at: newBook.created_at,
          owner_id: newBook.owner_id,
          type: 'account_book' as const,
        };
        setActiveLedger(newBookItem);
      }

      // Success - close modal
      setShowCreateModal(false);
      setBookName("");
      setBookDescription("");
      setLineNotifications(false);
      setSelectedMemberIds([]);
      
      // Navigate to home page to see the new book
      router.push('/');
    } catch (error: any) {
      console.error('Unexpected error creating ledger:', error);
      showAlert('Error', `error: ${error?.message || 'please try again'}`);
    } finally {
      setCreatingLedger(false);
    }
  };


  // Separate active and other books
  const activeBook = allBooks.find((b) => activeLedger?.id === b.id);
  const otherBooks = allBooks.filter((b) => activeLedger?.id !== b.id);

  const handleBookClick = (book: any) => {
    setActiveLedger(book);
    openMemberModal(book);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col max-w-md mx-auto overflow-x-hidden bg-background-light font-display text-slate-800 transition-colors duration-200 pb-32">
      <header className="sticky top-0 z-40 bg-background-light/90 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="w-10"></div>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 text-center flex-1">
          Account Book
        </h1>
        <button
          onClick={() => setShowLogoutModal(true)}
          className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
          title="Logout"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
            logout
          </span>
        </button>
      </header>

      <main className="flex flex-col px-5 mt-2">
        <button
          onClick={() => {
            // Clear all form state when opening create modal
            setBookName("");
            setBookDescription("");
            setLineNotifications(false);
            setSelectedMemberIds([]);
            setShowCreateModal(true);
          }}
          className="group flex items-center gap-4 mb-8 mt-4 pl-1 w-full text-left outline-none"
        >
          <div className="flex items-center justify-center size-12 rounded-full bg-primary text-white shadow-glow hover:bg-blue-600 group-hover:scale-110 group-active:scale-95 transition-all duration-300">
            <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
              add
            </span>
          </div>
          <span className="text-lg font-bold text-slate-900 group-hover:text-primary transition-colors duration-200">
            New Account Book
          </span>
        </button>

        <div className="flex flex-col gap-5">
          {activeBook && (
            <div className="group relative">
              <div
                onClick={() => handleBookClick(activeBook)}
                className="relative flex flex-col justify-between p-5 rounded-[24px] bg-surface-light shadow-soft border-[3px] border-primary transition-transform hover:scale-[1.02] cursor-pointer overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-primary/10 text-primary px-4 py-1.5 rounded-bl-[20px] text-xs font-bold tracking-wide">
                  ACTIVE
                </div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex flex-col gap-1 flex-1">
                    <h2 className="text-xl font-bold text-slate-900 leading-tight">
                      {activeBook.name}
                    </h2>
                    <p className="text-sm font-medium text-slate-500">
                      {activeBook.description || 'No description'}
                    </p>
                  </div>
                </div>
                <div className="h-px w-full bg-slate-100 my-2"></div>
                <div className="flex items-end justify-between mt-1">
                  <div className="flex -space-x-3">
                    {bookMembers[activeBook.id] && bookMembers[activeBook.id].length > 0 ? (
                      <>
                        {bookMembers[activeBook.id].slice(0, 3).map((member: any) => (
                          <div
                            key={member.id}
                            className={`size-8 rounded-full border-2 border-white bg-cover bg-center ${member.avatar ? '' : 'bg-slate-200'}`}
                            style={{
                              backgroundImage: member.avatar ? `url("${member.avatar}")` : 'none',
                            }}
                          ></div>
                        ))}
                        {bookMembers[activeBook.id].length > 3 && (
                          <div className="size-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            +{bookMembers[activeBook.id].length - 3}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="size-8 rounded-full border-2 border-white bg-slate-200"></div>
                    )}
                  </div>
                  {((currentUserId === activeBook.owner_id || currentUserId === activeBook.created_by) || 
                    (activeBook.type === 'ledger' && bookMembers[activeBook.id]?.some((m: any) => m.id === currentUserId && m.role === 'Owner'))) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteModal(activeBook);
                      }}
                      aria-label="Delete"
                      className="flex items-center justify-center size-8 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                        delete
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {otherBooks.map((book, index) => {
            const icon = getBookIcon(index + (activeBook ? 1 : 0));
            return (
              <div
                key={book.id}
                onClick={() => handleBookClick(book)}
                className={`relative flex flex-col justify-between p-5 rounded-[24px] bg-surface-light shadow-soft border border-transparent hover:border-slate-200 transition-all hover:scale-[1.01] cursor-pointer ${index === otherBooks.length - 1 ? "opacity-80" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1 flex-1">
                    <h2 className="text-lg font-bold text-slate-900 leading-tight">
                      {book.name}
                    </h2>
                    <p className="text-sm font-medium text-slate-500">
                      {book.description ? book.description : 'No description'}
                    </p>
                  </div>
                </div>
                <div className="flex items-end justify-between mt-6">
                  <div className="flex -space-x-3">
                    {bookMembers[book.id] && bookMembers[book.id].length > 0 ? (
                      <>
                        {bookMembers[book.id].slice(0, 3).map((member: any) => (
                          <div
                            key={member.id}
                            className={`size-8 rounded-full border-2 border-white bg-cover bg-center ${member.avatar ? '' : 'bg-slate-200'}`}
                            style={{
                              backgroundImage: member.avatar ? `url("${member.avatar}")` : 'none',
                            }}
                          ></div>
                        ))}
                        {bookMembers[book.id].length > 3 && (
                          <div className="size-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            +{bookMembers[book.id].length - 3}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="size-8 rounded-full border-2 border-white bg-slate-200"></div>
                    )}
                  </div>
                  {((currentUserId === book.owner_id || currentUserId === book.created_by) || 
                    (book.type === 'ledger' && bookMembers[book.id]?.some((m: any) => m.id === currentUserId && m.role === 'Owner'))) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteModal(book);
                      }}
                      aria-label="Delete"
                      className="flex items-center justify-center size-8 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                        delete
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => {
            setShowCreateModal(false);
            setBookName("");
            setBookDescription("");
            setLineNotifications(false);
          }}></div>
          <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto bg-background-light overflow-x-hidden shadow-2xl">
            <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-4 bg-background-light/95 backdrop-blur-sm">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setBookName("");
                  setBookDescription("");
                  setLineNotifications(false);
                }}
                className="group flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-gray-600 group-hover:text-primary transition-colors" style={{ fontSize: "24px" }}>close</span>
              </button>
              <h2 className="text-lg font-bold leading-tight tracking-tight text-center flex-1 pr-10 text-gray-900">Create New Book</h2>
            </header>
            <main className="flex-1 px-5 pb-40 pt-2 space-y-8">
              <section className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 ml-2">Account Book Name</label>
                <div className="relative">
                  <input
                    className="form-input block w-full h-14 px-6 rounded-full bg-white border-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary/50 shadow-sm text-base transition-all"
                    placeholder="e.g., family account book"
                    type="text"
                    value={bookName}
                    onChange={(e) => setBookName(e.target.value)}
                  />
                </div>
              </section>
              <section className="space-y-3">
                <div className="flex justify-between items-end px-2">
                  <label className="text-sm font-bold text-gray-700">Members</label>
                  <span className="text-xs text-gray-400 font-medium">1 Member</span>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between bg-white p-3 pr-5 rounded-card shadow-sm border border-transparent">
                    <div className="flex items-center gap-3">
                      <div className="relative size-12 rounded-full overflow-hidden ring-2 ring-white shadow-sm">
                        {currentUserProfile?.avatar_url ? (
                          <img 
                            alt="Portrait of the current user" 
                            className="w-full h-full object-cover" 
                            src={currentUserProfile.avatar_url}
                            onError={(e) => {
                              console.error('Failed to load avatar image:', currentUserProfile.avatar_url);
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-blue-50">
                            <span className="material-symbols-outlined text-primary text-2xl">person</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900">{currentUserProfile?.full_name || 'You'}</span>
                        <span className="text-xs text-primary font-medium">Owner</span>
                      </div>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">Admin</div>
                  </div>
                  <button
                    onClick={handleInviteMember}
                    className="w-full group flex items-center justify-center gap-3 p-5 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-center size-8 rounded-full bg-primary text-white shadow-sm">
                      <span className="material-symbols-outlined text-[20px]">add</span>
                    </div>
                    <span className="text-primary font-bold text-base">Invite Member</span>
                  </button>
                </div>
              </section>
              <section className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 ml-2">
                  Description <span className="text-gray-400 font-normal text-xs ml-1">(Optional)</span>
                </label>
                <textarea
                  className="form-textarea block w-full p-5 rounded-card bg-white border-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary/50 shadow-sm text-base resize-none h-32 transition-all"
                  placeholder="Enter a description"
                  value={bookDescription}
                  onChange={(e) => setBookDescription(e.target.value)}
                ></textarea>
              </section>
              <section className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 ml-2">Notifications</label>
                <div className="flex items-center justify-between p-5 rounded-card bg-white shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center size-10 rounded-full bg-[#06C755]/10 shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.127-.033.194-.033.195 0 .375.104.495.27l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.086.766.062 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" fill="#06C755"/>
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">Monthly LINE Report</span>
                      <span className="text-xs text-gray-400 mt-1">Receive a summary via LINE bot</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      checked={lineNotifications}
                      onChange={async (e) => {
                        const newValue = e.target.checked;
                        setLineNotifications(newValue);
                        
                        // For CREATE NEW BOOK modal, this will be handled when creating the ledger
                        // The notification setting will be set when the ledger member is created
                        // So we just update the state here
                      }}
                      className="sr-only peer"
                      type="checkbox"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </section>
            </main>
            <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-30 p-5 bg-gradient-to-t from-background-light via-background-light to-transparent pt-10 pb-6 pointer-events-none">
              <button
                onClick={handleCreateLedger}
                disabled={!bookName.trim() || creatingLedger}
                className="pointer-events-auto w-full h-14 bg-primary hover:bg-primary/90 rounded-full text-white font-bold text-lg shadow-lg shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingLedger ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <span>Create Book</span>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: "20px" }}>arrow_forward</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && selectedBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => {
            setShowDeleteModal(false);
            setSelectedBook(null);
          }}></div>
          <div className="relative w-full max-w-[340px] bg-white rounded-[24px] p-6 shadow-2xl flex flex-col items-center text-center transform transition-all animate-in fade-in zoom-in duration-200">
            <div className="mb-5 flex items-center justify-center size-14 rounded-full bg-red-50 text-red-500">
              <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>delete</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Confirm Deletion</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed px-2">
              Are you sure you want to delete this account book? This action cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-4 w-full">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedBook(null);
                }}
                className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBook}
                className="py-3.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-red-500/30 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showMemberModal && selectedBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background-light">
          <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto shadow-2xl bg-background-light">
            <header className="flex items-center justify-between px-6 py-4 bg-background-light sticky top-0 z-20">
              <button
                onClick={() => {
                  // Revert pending changes when closing without saving
                  setPendingMemberRoleChanges({});
                  setLineNotifications(originalLineNotifications);
                  setShowMemberModal(false);
                  setSelectedBook(null);
                }}
                className="flex items-center justify-center size-10 rounded-full bg-white shadow-sm border border-gray-100 hover:bg-gray-50 transition-all active:scale-95 text-gray-900"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
              <h1 className="text-lg font-bold text-gray-900">Account Book Management</h1>
              <div className="w-10"></div>
            </header>
            <main className="flex flex-col px-5 py-2 gap-5 flex-1 pb-24 overflow-y-auto">
              <div className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <label className="px-1 text-xs font-bold tracking-wider text-gray-500 uppercase">Account Book Name</label>
                  <input
                    className="w-full px-5 py-4 text-lg font-bold text-gray-900 bg-white border-0 shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-lg focus:ring-2 focus:ring-primary/50 placeholder-gray-400"
                    type="text"
                    value={selectedBook.name || ''}
                    onChange={(e) => {
                      setSelectedBook({ ...selectedBook, name: e.target.value });
                      setBookName(e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-gray-700 ml-2">
                    Description <span className="text-gray-400 font-normal text-xs ml-1">(Optional)</span>
                  </label>
                  <textarea
                    className="form-textarea block w-full p-5 rounded-card bg-white border-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary/50 shadow-sm text-base resize-none h-32 transition-all"
                    placeholder="What is this book for?"
                    value={selectedBook.description || ''}
                    onChange={(e) => {
                      setSelectedBook({ ...selectedBook, description: e.target.value });
                      setBookDescription(e.target.value);
                    }}
                  ></textarea>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="px-1 text-xs font-bold tracking-wider text-gray-500 uppercase">Invitation Link</label>
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 px-5 py-4 text-sm font-mono text-gray-900 bg-white border-0 shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-lg focus:ring-2 focus:ring-primary/50 placeholder-gray-400"
                    type="text"
                    value={selectedBook.type === 'ledger' 
                      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/invite?ledger=${selectedBook.id}`
                      : `${typeof window !== 'undefined' ? window.location.origin : ''}/invite?book=${selectedBook.id}`
                    }
                    readOnly
                  />
                    <button
                      onClick={handleShareInviteLink}
                      className="px-4 py-4 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shrink-0 relative"
                    >
                      <span className="material-symbols-outlined">content_copy</span>
                      {linkCopied && (
                        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 px-3 py-1.5 bg-gray-800 text-white text-sm font-medium rounded-lg shadow-lg whitespace-nowrap animate-fade-out">
                          Copied!
                          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                        </div>
                      )}
                    </button>
                </div>
                <p className="px-1 text-xs text-gray-500">Share this link with others to invite them to join this {selectedBook.type === 'ledger' ? 'ledger' : 'account book'}</p>
              </div>
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Current Members</h3>
                <span className="bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{getMembers(selectedBook).length}</span>
              </div>
              <div className="flex flex-col gap-3">
                {getMembers(selectedBook).map((member) => (
                  <div key={member.id} className="flex items-center justify-between bg-white p-4 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-transparent">
                    <div className="flex items-center gap-4 overflow-hidden">
                      <div className="relative shrink-0">
                        {member.avatar ? (
                          <div className="size-14 rounded-full bg-gray-100 bg-center bg-cover border-2 border-white shadow-sm" style={{ backgroundImage: `url("${member.avatar}")` }}></div>
                        ) : (
                          <div className="size-14 rounded-full bg-blue-50 flex items-center justify-center border-2 border-white shadow-sm">
                            <span className="material-symbols-outlined text-primary text-2xl">sentiment_satisfied</span>
                          </div>
                        )}
                        {member.isYou && (
                          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-[2px]">
                            <div className="bg-primary size-3.5 rounded-full border-2 border-white"></div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-gray-900 truncate">{member.name}</p>
                          {member.isYou && <span className="text-xs font-medium text-gray-400">(You)</span>}
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold w-fit ${
                          member.role === 'Owner' 
                            ? 'bg-primary/10 text-primary'
                            : member.role === 'Member'
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-sky-100 text-sky-600'
                        }`}>
                          {member.role}
                        </span>
                      </div>
                    </div>
                    {!member.isYou && canModifyMember(selectedBook, member) && (
                      <div className="relative">
                        <button 
                          onClick={() => setOpenMemberMenu(openMemberMenu === member.id ? null : member.id)}
                          className="size-10 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-50 transition-colors"
                        >
                          <span className="material-symbols-outlined">more_horiz</span>
                        </button>
                        {openMemberMenu === member.id && (
                          <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-lg border border-gray-100 z-50 min-w-[160px] overflow-hidden">
                            <button
                              onClick={() => {
                                handleUpdateMemberRole(member.id, 'Member');
                                setOpenMemberMenu(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              Member
                            </button>
                            <button
                              onClick={() => {
                                handleUpdateMemberRole(member.id, 'Viewer');
                                setOpenMemberMenu(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              Viewer
                            </button>
                            <div className="border-t border-gray-100"></div>
                            <button
                              onClick={() => {
                                setMemberToDelete({ id: member.id, name: member.name });
                                setShowDeleteMemberModal(true);
                                setOpenMemberMenu(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <button
                  onClick={handleInviteMember}
                  className="w-full group flex items-center justify-center gap-3 p-5 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center justify-center size-8 rounded-full bg-primary text-white shadow-sm">
                    <span className="material-symbols-outlined text-[20px]">add</span>
                  </div>
                  <span className="text-primary font-bold text-base">Invite Member</span>
                </button>
              </div>
              <section className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 ml-2">Notifications</label>
                <div className="flex items-center justify-between p-5 rounded-card bg-white shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center size-10 rounded-full bg-[#06C755]/10 shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.127-.033.194-.033.195 0 .375.104.495.27l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.086.766.062 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" fill="#06C755"/>
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">Monthly LINE Report</span>
                      <span className="text-xs text-gray-400 mt-1">Receive a summary via LINE bot</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      checked={lineNotifications}
                      onChange={(e) => {
                        // Only update local state, don't save to database yet
                        setLineNotifications(e.target.checked);
                      }}
                      className="sr-only peer"
                      type="checkbox"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </section>
              
              {/* Export to Excel Button */}
              <div className="space-y-1.5 mt-4">
                <label className="px-1 text-xs font-bold tracking-wider text-gray-500 uppercase">Export Data</label>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="w-full flex items-center justify-between px-5 py-4 bg-white border-0 shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-10 rounded-full bg-green-500 text-white shadow-sm group-hover:bg-green-600 transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                        download
                      </span>
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-base font-bold text-gray-900">Export to Excel</span>
                      <span className="text-xs text-gray-500">Download transaction data</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-400" style={{ fontSize: "20px" }}>chevron_right</span>
                </button>
              </div>
            </main>
            <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-30 p-5 bg-gradient-to-t from-background-light via-background-light to-transparent pt-6 pb-6">
              <button
                onClick={handleUpdateBook}
                className="w-full h-14 bg-primary hover:bg-primary/90 rounded-full text-white font-bold text-lg shadow-lg shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showSelectMemberModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => {
            setShowSelectMemberModal(false);
          }}></div>
          <div className="relative w-full max-w-md bg-white rounded-[24px] p-6 shadow-2xl max-h-[80vh] flex flex-col">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Select Members</h3>
            <div className="flex-1 overflow-y-auto mb-4">
              {availableMembers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No available members found</p>
              ) : (
                <div className="space-y-2">
                  {availableMembers.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(member.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMemberIds(prev => [...prev, member.id]);
                          } else {
                            setSelectedMemberIds(prev => prev.filter(id => id !== member.id));
                          }
                        }}
                        className="size-5 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <div className="flex items-center gap-3 flex-1">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.full_name}
                            className="size-10 rounded-full"
                          />
                        ) : (
                          <div className="size-10 rounded-full bg-blue-50 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary">person</span>
                          </div>
                        )}
                        <span className="font-medium text-gray-900">{member.full_name || 'Unknown'}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSelectMemberModal(false);
                  setSelectedMemberIds([]);
                }}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSelectedMembers}
                className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold transition-colors"
              >
                Add ({selectedMemberIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteMemberModal && memberToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => {
            setShowDeleteMemberModal(false);
            setMemberToDelete(null);
          }}></div>
          <div className="relative w-full max-w-[340px] bg-white rounded-[24px] p-6 shadow-2xl flex flex-col items-center text-center transform transition-all animate-in fade-in zoom-in duration-200">
            <div className="mb-5 flex items-center justify-center size-14 rounded-full bg-red-50 text-red-500">
              <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>delete</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">delete member</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed px-2">
            Are you sure you want to remove "{memberToDelete.name}" from this book?
            </p>
            <div className="grid grid-cols-2 gap-4 w-full">
              <button
                onClick={() => {
                  setShowDeleteMemberModal(false);
                  setMemberToDelete(null);
                }}
                className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-colors"
              >
                cancel
              </button>
              <button
                onClick={handleDeleteMember}
                className="py-3.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-red-500/30 transition-colors"
              >
                delete
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md h-16 bg-white rounded-full shadow-float flex items-center justify-around px-2 z-50">
        <Link
          href="/"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>home</span>
        </Link>
        <Link
          href="/statistics"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>pie_chart</span>
        </Link>
        <div className="w-12"></div>
        <Link
          href="/finance"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>account_balance_wallet</span>
        </Link>
        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
          <span className="material-symbols-outlined filled" style={{ fontVariationSettings: "'FILL' 1", fontSize: "24px" }}>
            settings
          </span>
        </div>
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          <Link
            href="/add"
            className="w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>add</span>
          </Link>
        </div>
      </nav>

      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title="Confirm Logout"
        message="Are you sure you want to logout?"
        confirmText="Logout"
        cancelText="Cancel"
        type="warning"
        isLoading={isLoggingOut}
      />

      <ConfirmModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        onConfirm={() => setShowAlertModal(false)}
        title={alertTitle}
        message={alertMessage}
        confirmText="Confirm"
        cancelText=""
        type="warning"
      />

      {/* Export to Excel Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => setShowExportModal(false)}></div>
          <div className="relative w-full max-w-[400px] bg-white rounded-[24px] p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Export to Excel</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>close</span>
              </button>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Date Range</label>
              <button
                onClick={() => setShowExportDatePicker(true)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm text-slate-700">
                  {exportStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {exportEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="material-symbols-outlined text-gray-400" style={{ fontSize: "20px" }}>calendar_month</span>
              </button>
            </div>

            <div className="flex flex-col gap-3 mt-auto pt-4">
              <button
                onClick={() => setShowExportModal(false)}
                disabled={isExporting}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExportToExcel}
                disabled={isExporting}
                className="w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>download</span>
                    <span>Export</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Date Range Picker */}
      <DateRangePickerModal
        isOpen={showExportDatePicker}
        onClose={() => setShowExportDatePicker(false)}
        onConfirm={(start, end) => {
          setExportStartDate(start);
          setExportEndDate(end);
          setShowExportDatePicker(false);
        }}
        initialStartDate={exportStartDate}
        initialEndDate={exportEndDate}
      />
    </div>
  );
}
