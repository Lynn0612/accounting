"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLedger } from "@/contexts/LedgerContext";
import { useUser } from "@/hooks/useUser";
import { useProfiles } from "@/hooks/useProfiles";
import { useParticipants } from "@/hooks/useParticipants";
import { useOutstandingTotal } from "@/hooks/useOutstandingTotal";
import { useTransactions } from "@/hooks/useTransactions";
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
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

export default function HomePageClient({
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
  const { activeLedger } = useLedger();
  const { data: user } = useUser();
  const { data: profileMap } = useProfiles(user?.id ? [user.id] : []);
  const currentUserProfile = user?.id ? profileMap?.get(user.id) : null;
  const { data: participants = [] } = useParticipants(activeLedger?.id || null);
  const { data: realTimeOutstanding } = useOutstandingTotal(
    activeLedger?.id || null,
    activeLedger?.type as 'ledger' | 'account_book'
  );

  // Get current month date range for total income/expenses
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const { data: realTimeTransactions } = useTransactions({
    ledgerId: activeLedger?.id || '',
    ledgerType: activeLedger?.type || 'ledger',
    limit: 5,
    includeCategory: true,
    includePayer: true,
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ['settlements', 'recent', activeLedger?.id],
    enabled: !!activeLedger?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('settlements')
        .select('id, sender_id, receiver_id, amount, created_at, date, note')
        .eq('ledger_id', activeLedger!.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return error ? [] : data;
    },
  });

  const displayTransactions = useMemo(() => {
    const txs = (realTimeTransactions || initialTransactions).map(tx => ({
      ...tx,
      isSettlement: false,
      sortDate: new Date(tx.created_at) // 以記帳時間排序
    }));

    const sts = settlements.map((s: any) => {
      const isIncoming = s.receiver_id === user?.id;
      const sender = participants.find(p => p.id === s.sender_id);
      const receiver = participants.find(p => p.id === s.receiver_id);
      const senderName = sender?.name || '有人';
      const payerText = isIncoming ? `${senderName} paid` : '';
      
      return {
        id: `settlement-${s.id}`,
        description: s.note || 'Repayment',
        amount: s.amount,
        date: s.date || s.created_at,
        type: isIncoming ? 'income' : 'expense',
        isSettlement: true,
        sortDate: new Date(s.created_at), // 以記帳時間排序
        categories: { name: 'Repayment', icon: '🤝' },
        payer: sender,
        payerText: payerText
      };
    });

    return [...txs, ...sts]
      .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
      .slice(0, 5);
  }, [realTimeTransactions, initialTransactions, settlements, user?.id, participants]);

  const { data: monthlyTransactions } = useTransactions({
    ledgerId: activeLedger?.id || '',
    ledgerType: activeLedger?.type || 'ledger',
    startDate: startOfMonth,
    endDate: endOfMonth,
    userId: user?.id, // 個人化交易紀錄
  }, {
    enabled: !!activeLedger?.id && !!user?.id
  });

  const [isOutstandingModalOpen, setIsOutstandingModalOpen] = useState(false);

  // Real-time calculation for Total Balance (個人餘額：個人的分帳收入 - 個人的分帳支出)
  const transactionsToUse = monthlyTransactions || [];
  const totalIncome = transactionsToUse
    .filter((tx: any) => tx.type === 'income' && tx.isSettlement !== true) // 排除還款
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
  const totalExpenses = transactionsToUse
    .filter((tx: any) => tx.type === 'expense' && tx.expense_payment_source !== 'deposit')
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  // 顯示該使用者的個人結餘 (只限本月)
  const displayIncome = monthlyTransactions ? totalIncome : initialIncome;
  const displayExpenses = monthlyTransactions ? totalExpenses : initialExpenses;
  const displayPercentage = monthlyTransactions 
    ? (displayIncome > 0 ? Math.min(100, Math.max(0, Math.round((displayExpenses / displayIncome) * 100))) : 0)
    : initialPercentage;

  const displayOutstanding = realTimeOutstanding ?? initialOutstanding;

  const absOutstanding = Math.abs(displayOutstanding);
  const othersOweMe = displayOutstanding > 0;
  const iOweOthers = displayOutstanding < 0;

  const otherParticipants = participants.filter(p => p.id !== user?.id);

  return (
    <div className="w-full max-w-md bg-background-light min-h-screen flex flex-col relative overflow-hidden mx-auto">
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

        {/* Total Outstanding Card */}
        <div 
          className="mt-6 cursor-pointer"
          onClick={() => router.push('/outstanding')}
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
              See All
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {displayTransactions.length > 0 ? (
              displayTransactions.map((tx: any) => (
                <TransactionCard
                  key={tx.id}
                  id={tx.id}
                  title={tx.description || tx.categories?.name || "Transaction"}
                  date={new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  categoryName={tx.categories?.name || "General"}
                  amount={tx.amount}
                  amountPrefix={tx.type === 'income' ? '+' : '-'}
                  amountColor={tx.type === 'income' ? 'text-green-500' : 'text-text-main'}
                  payerText={tx.payerText || (tx.payer_id === user?.id ? "You paid" : `${tx.payer?.full_name?.split(' ')[0] || tx.payer?.name || "Someone"} paid`)}
                  categoryIcon={tx.categories?.icon || "💰"}
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
      <nav className="fixed bottom-6 left-6 right-6 h-16 bg-white rounded-full shadow-float flex items-center justify-around px-2 z-20 max-w-md mx-auto">
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
          href="/transactions" 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${pathname === '/transactions' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
        >
          <span className={`material-symbols-outlined ${pathname === '/transactions' ? 'filled' : ''}`} style={pathname === '/transactions' ? { fontVariationSettings: "'FILL' 1" } : {}}>receipt_long</span>
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
}
