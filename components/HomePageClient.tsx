"use client";

import { useState, useMemo, memo, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startOfMonth, endOfMonth } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useLedger } from "@/contexts/LedgerContext";
import { useUser } from "@/hooks/useUser";
import { useProfiles } from "@/hooks/useProfiles";
import { useParticipants } from "@/hooks/useParticipants";
import { useOutstandingTotal } from "@/hooks/useOutstandingTotal";
import { useTransactions } from "@/hooks/useTransactions";
import { useSettlements } from "@/hooks/useSettlements";
import LedgerDropdown from "@/components/LedgerDropdown";
import SemiCircleProgress from "@/components/SemiCircleProgress";
import TransactionCard from "@/components/TransactionCard";
import OutstandingModal from "@/components/OutstandingModal";
import { formatAmountSimple } from "@/utils/formatAmount";

interface HomePageClientProps {
  totalIncome: number;
  totalExpenses: number;
  outstanding: number;
  recentTransactions: any[];
  percentage: number;
  activeBookName: string;
  initialLedgers: any[];
}

const HomePageClient = memo(function HomePageClient({
  totalIncome: initialIncome,
  totalExpenses: initialExpenses,
  outstanding: initialOutstanding,
  recentTransactions: initialTransactions,
  percentage: initialPercentage,
  activeBookName,
  initialLedgers,
}: HomePageClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeLedger } = useLedger();
  const { data: user } = useUser();
  const { data: profileMap } = useProfiles(user?.id ? [user.id] : []);
  const currentUserProfile = useMemo(() => 
    user?.id ? profileMap?.get(user.id) : null,
    [user?.id, profileMap]
  );
  const { data: participants = [] } = useParticipants(activeLedger?.id || null);
  const { data: realTimeOutstanding } = useOutstandingTotal(
    activeLedger?.id || null,
    activeLedger?.type as 'ledger' | 'account_book'
  );

  // Get current month date range for total income/expenses - recalculate on every render to ensure current month
  // Use useMemo with month key to detect month changes
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const { startOfMonthStr, endOfMonthStr } = useMemo(() => {
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return {
      startOfMonthStr: monthStart.toISOString().split('T')[0],
      endOfMonthStr: monthEnd.toISOString(),
    };
  }, [currentMonthKey]); // Recalculate when month changes
  
  // Debug: Log current month range (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('Current month range:', { startOfMonthStr, endOfMonthStr, currentMonth: now.getMonth() + 1, currentYear: now.getFullYear() });
  }

  // Recent transactions: filter to current month to prioritize "New Month" focus
  const { data: realTimeTransactions, refetch: refetchRecent } = useTransactions({
    ledgerId: activeLedger?.id || '',
    ledgerType: activeLedger?.type || 'ledger',
    startDate: startOfMonthStr,
    endDate: endOfMonthStr,
    limit: 5,
    includeCategory: true,
    includePayer: true,
  }, {
    enabled: !!activeLedger?.id
  });
  
  // Force refetch when month changes
  useEffect(() => {
    if (activeLedger?.id) {
      refetchRecent();
    }
  }, [startOfMonthStr, activeLedger?.id, refetchRecent]);

  const { data: settlements = [] } = useSettlements({
    ledgerId: activeLedger?.id || null,
    ledgerType: activeLedger?.type as 'ledger' | 'account_book' | undefined,
    limit: 5,
    enabled: !!activeLedger?.id,
  });

  const displayTransactions = useMemo(() => {
    // Only use real-time transactions (current month), never fall back to initial server data
    // This ensures we show current month data, not cached server-side data from previous month
    const txs = (realTimeTransactions || []).map(tx => {
      // Pre-compute formatted date and payer text for each transaction
      const formattedDate = new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      let payerText = '';
      if (tx.expense_payment_source === 'deposit' || tx.income_mode === 'deposit') {
        payerText = 'Deposit';
      } else if (tx.payer_id === user?.id) {
        payerText = "You paid";
      } else if (tx.payer) {
        const payerName = tx.payer?.full_name || tx.payer?.name;
        payerText = payerName ? `${String(payerName).split(' ')[0]} paid` : "Someone paid";
      }
      
      return {
      ...tx,
      isSettlement: false,
        transactionDate: new Date(tx.date), // 交易日期
        createdAt: new Date(tx.created_at), // 創建時間
        formattedDate, // Pre-computed formatted date
        payerText: tx.payerText || payerText, // Pre-computed payer text
      };
    });

    const sts = settlements.map((s: any) => {
      const isIncoming = s.receiver_id === user?.id;
      const sender = participants.find(p => p.id === s.sender_id);
      const receiver = participants.find(p => p.id === s.receiver_id);
      const senderName = sender?.name || '有人';
      const receiverName = receiver?.name || '有人';
      const payerText = isIncoming ? `${senderName} paid` : `${receiverName} paid`;
      const transactionDate = s.date ? new Date(s.date) : s.created_at ? new Date(s.created_at) : new Date();
      
      return {
        id: `settlement-${s.id}`,
        description: s.note || 'Repayment',
        amount: s.amount,
        date: transactionDate,
        type: isIncoming ? 'income' : 'expense',
        isSettlement: true,
        transactionDate, // 交易日期
        createdAt: new Date(s.created_at), // 創建時間
        categories: { name: 'Repayment', icon: '🤝' },
        payer: sender || null,
        payerText: String(payerText),
        formattedDate: transactionDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    });

    // Sort by date first (newest date first), then by createdAt (newest time first)
    const sorted = [...txs, ...sts].sort((a, b) => {
      // First, compare by date (transaction date) - only compare date part, ignore time
      const dateA = new Date(a.transactionDate || a.date)
      dateA.setHours(0, 0, 0, 0)
      const dateB = new Date(b.transactionDate || b.date)
      dateB.setHours(0, 0, 0, 0)
      const dateATime = dateA.getTime()
      const dateBTime = dateB.getTime()
      const dateDiff = dateBTime - dateATime // Newest date first
      
      // If dates are the same (same day), compare by createdAt (time)
      if (dateDiff === 0) {
        const timeA = a.createdAt?.getTime() || 0
        const timeB = b.createdAt?.getTime() || 0
        return timeB - timeA // Newest time first
      }
      
      return dateDiff
    });

    return sorted.slice(0, 5);
  }, [realTimeTransactions, settlements, user?.id, participants]);

  const { data: monthlyTransactions, refetch: refetchMonthly } = useTransactions({
    ledgerId: activeLedger?.id || '',
    ledgerType: activeLedger?.type || 'ledger',
    startDate: startOfMonthStr,
    endDate: endOfMonthStr,
    userId: user?.id, // 個人化交易紀錄
  }, {
    enabled: !!activeLedger?.id && !!user?.id
  });
  
  // Force refetch when month changes
  useEffect(() => {
    if (activeLedger?.id && user?.id) {
      refetchMonthly();
    }
  }, [startOfMonthStr, activeLedger?.id, user?.id, refetchMonthly]);

  // Query all shared expenses (公費總支出) for the current month
  // Note: We don't use userId filter here because shared expenses are ledger-wide
  const { data: allMonthlyTransactions, isLoading: isLoadingShared, refetch: refetchShared } = useTransactions({
    ledgerId: activeLedger?.id || '',
    ledgerType: activeLedger?.type || 'ledger',
    startDate: startOfMonthStr,
    endDate: endOfMonthStr,
    type: 'expense',
    includeCategory: true,
  }, {
    enabled: !!activeLedger?.id,
    // Don't use initialData to avoid showing stale server-side data
  });
  
  // Force refetch when month changes
  useEffect(() => {
    if (activeLedger?.id) {
      refetchShared();
    }
  }, [startOfMonthStr, activeLedger?.id, refetchShared]);
  
  // Debug: Log shared expenses count (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('Monthly shared expenses:', { 
      count: allMonthlyTransactions?.length || 0, 
      isLoading: isLoadingShared,
      dateRange: { start: startOfMonthStr, end: endOfMonthStr },
      transactions: allMonthlyTransactions?.slice(0, 3).map((t: any) => ({ id: t.id, date: t.date, amount: t.amount, public_amount: t.public_amount }))
    });
  }

  const [isOutstandingModalOpen, setIsOutstandingModalOpen] = useState(false);

  // Real-time calculation for Total Balance (個人餘額：個人的分帳收入 - 個人的分帳支出)
  // Memoize calculations to avoid unnecessary recalculations
  const { totalIncome, totalExpenses } = useMemo(() => {
  const transactionsToUse = monthlyTransactions || [];
    return {
      totalIncome: transactionsToUse
        .filter((tx: any) => tx.type === 'income' && tx.isSettlement !== true && tx.income_mode !== 'deposit') // 排除還款和儲值金
        .reduce((sum, tx) => sum + Number(tx.amount), 0),
      totalExpenses: transactionsToUse
    .filter((tx: any) => tx.type === 'expense' && tx.expense_payment_source !== 'deposit')
        .reduce((sum, tx) => sum + Number(tx.amount), 0),
    };
  }, [monthlyTransactions]);

  // Calculate Total Shared Expense (公費總支出)
  // Only add the public_amount (公費金額), not the total transaction amount
  const totalSharedExpense = useMemo(() => {
    const transactionsToUse = allMonthlyTransactions || [];
    return transactionsToUse
      .filter((tx: any) => 
        tx.type === 'expense' && 
        tx.is_public_expense === true &&
        tx.expense_payment_source !== 'deposit' &&
        tx.public_amount != null // Only count transactions with public_amount
      )
      .reduce((sum, tx) => sum + Number(tx.public_amount || 0), 0);
  }, [allMonthlyTransactions]);

  // 顯示該使用者的個人結餘 (只限本月) - always use real-time monthly data, ignore initial server data
  const { displayIncome, displayExpenses, displayPercentage } = useMemo(() => {
    // Always use real-time monthly transactions data, never fall back to initial server data
    // This ensures we show current month data, not cached server-side data from previous month
    const income = totalIncome;
    const expenses = totalExpenses;
    const percentage = income > 0 ? Math.min(100, Math.max(0, Math.round((expenses / income) * 100))) : 0;
    return { displayIncome: income, displayExpenses: expenses, displayPercentage: percentage };
  }, [totalIncome, totalExpenses]);

  const displayOutstanding = useMemo(() => 
    realTimeOutstanding ?? initialOutstanding,
    [realTimeOutstanding, initialOutstanding]
  );

  const { absOutstanding, othersOweMe, iOweOthers } = useMemo(() => {
    const abs = Math.abs(displayOutstanding);
    return {
      absOutstanding: abs,
      othersOweMe: displayOutstanding > 0,
      iOweOthers: displayOutstanding < 0,
    };
  }, [displayOutstanding]);

  const otherParticipants = useMemo(() => 
    participants.filter(p => p.id !== user?.id),
    [participants, user?.id]
  );

  // Memoize navigation click handler
  const handleOutstandingClick = useCallback(() => {
    router.push('/outstanding');
  }, [router]);

  return (
    <div className="w-full max-w-md bg-background-light min-h-screen flex flex-col relative overflow-x-hidden mx-auto pb-32" style={{ minHeight: '100dvh' }}>
      <header className="pt-8 pb-4 px-6 flex items-center justify-center z-[100]">
        <LedgerDropdown className="w-auto" />
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-24 px-6">
        {/* Total Balance Card */}
        <div className="bg-white rounded-card p-6 shadow-soft mt-2 relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-colors"></div>
          <div className="flex flex-col items-center justify-center relative z-10">
            <p className="text-text-muted text-sm font-medium mb-1">Total Balance</p>
            <h2 className="text-4xl font-bold text-text-main tracking-tight mb-6">
              {formatAmountSimple(displayIncome - displayExpenses)}
            </h2>
            <SemiCircleProgress percentage={displayPercentage} />
          </div>
        </div>

        {/* Total Shared Expense Card */}
        {participants.length > 1 && (
          <div className="mt-6">
            <div className="bg-white rounded-card p-5 shadow-soft flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">groups</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-text-main">Total Shared Expense</h4>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-text-main">
                    {formatAmountSimple(totalSharedExpense)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Total Outstanding Card */}
        <div 
          className="mt-6 cursor-pointer"
          onClick={handleOutstandingClick}
        >
          <div className="bg-white rounded-card p-5 shadow-soft flex flex-col">
            <div className="flex items-center justify-between px-2 mb-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shadow-sm overflow-hidden">
                  {currentUserProfile?.avatar_url ? (
                    <img src={currentUserProfile.avatar_url} alt="Me" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                      {currentUserProfile?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold text-text-main">我</span>
              </div>
              <div className="flex-1 px-4 flex flex-col items-center -mt-2">
                <span className={`material-symbols-outlined text-gray-300 mb-1 ${iOweOthers ? 'rotate-0' : 'rotate-180'}`} style={{ fontSize: "32px" }}>
                  arrow_right_alt
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="flex -space-x-3">
                  {otherParticipants.slice(0, 2).map((p, i) => (
                    <div 
                      key={p.id}
                      className={`w-10 h-10 rounded-full ${i === 0 ? 'bg-orange-50' : 'bg-green-50'} flex items-center justify-center shadow-sm z-10 overflow-hidden`}
                    >
                      {p.avatar ? (
                        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  ))}
                  {otherParticipants.length > 2 && (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shadow-sm z-0">
                      <span className="text-[10px] font-bold text-text-muted">+{otherParticipants.length - 2}</span>
                    </div>
                  )}
                  {otherParticipants.length === 0 && (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shadow-sm z-0">
                      <span className="text-lg text-text-muted">👥</span>
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold text-text-main">Others</span>
              </div>
            </div>
            <div className="h-px bg-gray-100 w-full mb-4"></div>
            <div className="text-center">
              <p className="text-xs text-text-muted mb-1">Total Outstanding</p>
              <p className={`text-2xl font-bold ${othersOweMe ? 'text-primary' : iOweOthers ? 'text-red-500' : 'text-text-main'}`}>
                {displayOutstanding === 0 ? '$0' : othersOweMe ? `+${formatAmountSimple(absOutstanding)}` : `-${formatAmountSimple(absOutstanding)}`}
              </p>
            </div>
          </div>
        </div>

        {/* Recent Transactions Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-lg font-bold text-text-main">Recent Transactions</h3>
            <Link href="/transactions" className="text-sm text-primary font-semibold hover:text-blue-600 transition-colors">
              View All
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {displayTransactions.length > 0 ? (
              displayTransactions.map((tx: any) => (
                <TransactionCard
                  key={tx.id}
                  id={tx.id}
                  title={String(tx.description || tx.categories?.name || "Transaction")}
                  date={String(tx.formattedDate || new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}
                  categoryName={String(tx.categories?.name || "General")}
                  amount={Number(tx.amount) || 0}
                  amountPrefix={tx.type === 'income' ? '+' : '-'}
                  amountColor={tx.type === 'income' ? 'text-green-500' : 'text-text-main'}
                  payerText={String(tx.payerText || '')}
                  categoryIcon={String(tx.categories?.icon || "💰")}
                  iconBg={tx.isSettlement ? 'bg-indigo-50 dark:bg-indigo-900/20' : (tx.type === 'income' ? 'bg-green-50' : 'bg-orange-50')}
                />
              ))
            ) : (
              <div className="text-center py-10 bg-white rounded-card shadow-soft">
                <p className="text-text-muted">No recent transactions</p>
              </div>
            )}
          </div>
        </div>

        <div className="h-8"></div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md h-16 bg-white rounded-full shadow-float flex items-center justify-around px-2 z-50">
        <Link 
          href="/" 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${pathname === '/' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
        >
          <span className={`material-symbols-outlined ${pathname === '/' ? 'filled' : ''}`} style={pathname === '/' ? { fontVariationSettings: "'FILL' 1" } : {}}>home</span>
        </Link>
        <Link 
          href="/statistics" 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${pathname === '/statistics' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
        >
          <span className={`material-symbols-outlined ${pathname === '/statistics' ? 'filled' : ''}`} style={pathname === '/statistics' ? { fontVariationSettings: "'FILL' 1" } : {}}>pie_chart</span>
        </Link>
        <div className="w-12"></div>
        <Link 
          href="/finance" 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${pathname === '/finance' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
        >
          <span className={`material-symbols-outlined ${pathname === '/finance' ? 'filled' : ''}`} style={pathname === '/finance' ? { fontVariationSettings: "'FILL' 1" } : {}}>account_balance_wallet</span>
        </Link>
        <Link 
          href="/settings" 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${pathname === '/settings' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
        >
          <span className={`material-symbols-outlined ${pathname === '/settings' ? 'filled' : ''}`} style={pathname === '/settings' ? { fontVariationSettings: "'FILL' 1" } : {}}>settings</span>
        </Link>
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          <Link href="/add" className="w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
            <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>add</span>
          </Link>
        </div>
      </nav>

      <OutstandingModal 
        isOpen={false} 
        onClose={() => {}} 
      />
    </div>
  );
});

HomePageClient.displayName = "HomePageClient";

export default HomePageClient;
