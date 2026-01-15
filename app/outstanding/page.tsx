"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import { createClient } from "@/lib/supabase/client";
import { useLedger } from "@/contexts/LedgerContext";
import Loading from "@/components/Loading";

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Tx = {
  id: string;
  payer_id: string;
  description: string | null;
  date: string;
  categories?: { name: string | null } | null;
};

type Split = {
  transaction_id: string;
  user_id: string;
  amount: number;
};

type OutstandingRow = {
  id: string;
  name: string;
  avatar: string | null;
  amount: number;
};

function toDateOnlyString(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatRange(start: Date, end: Date) {
  const s = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${s} - ${e}`;
}

export default function OutstandingPage() {
  const router = useRouter();
  const { activeLedger } = useLedger();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState<"all" | "range">("all");
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));

  const [whoIOwe, setWhoIOwe] = useState<OutstandingRow[]>([]);
  const [whoOwesMe, setWhoOwesMe] = useState<OutstandingRow[]>([]);

  const fetchData = useCallback(async () => {
    if (!activeLedger?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setWhoIOwe([]);
        setWhoOwesMe([]);
        return;
      }

      const scopeColumn = activeLedger.type === "account_book" ? "book_id" : "ledger_id";
      const startStr = toDateOnlyString(startDate);
      const endStr = toDateOnlyString(endDate);

      // Fetch all relevant splits at once, similar to useOutstandingTotal hook
      let splitsQuery = supabase
        .from('transaction_splits')
        .select(`
          amount,
          user_id,
          transactions!inner (
            id,
            payer_id,
            type,
            income_mode,
            date,
            expense_payment_source
          )
        `)
        .eq(scopeColumn, activeLedger.id);

      if (dateMode === "range") {
        splitsQuery = splitsQuery
          .gte('transactions.date', startStr)
          .lte('transactions.date', endStr);
      }

      const { data: splits, error: splitsError } = await splitsQuery;

      if (splitsError || !splits) {
        console.error('Error fetching splits:', splitsError);
        setWhoIOwe([]);
        setWhoOwesMe([]);
        return;
      }

      const profileIds = new Set<string>();
      profileIds.add(user.id);
      (splits as any[]).forEach(s => {
        profileIds.add(s.user_id);
        if (s.transactions?.payer_id) profileIds.add(s.transactions.payer_id);
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,avatar_url")
        .in("id", Array.from(profileIds));

      const profileById = new Map<string, Profile>();
      (profiles || []).forEach((p: any) => {
        profileById.set(p.id, {
          id: p.id,
          full_name: p.full_name ?? null,
          avatar_url: p.avatar_url ?? null,
        });
      });

      const oweMap = new Map<string, number>();
      const owedMap = new Map<string, number>();

      for (const s of splits as any[]) {
        const tx = s.transactions;
        if (!tx) continue;
        
        // Exclude deposit-funded expenses if necessary (matching useTransactions/Balance logic)
        if (tx.type === 'expense' && tx.expense_payment_source === 'deposit') continue;

        const txType = tx.type;
        const incomeMode = tx.income_mode;
        
        // Only count expenses and bonus/refund income
        if (txType !== 'expense' && !(txType === 'income' && (incomeMode === 'bonus' || incomeMode === 'refund'))) continue;

        const payerId = tx.payer_id;
        const splitUserId = s.user_id;
        const amt = Number(s.amount || 0);
        
        if (!payerId || !splitUserId || amt <= 0) continue;
        if (payerId === splitUserId) continue;

        if (txType === 'expense') {
          if (payerId === user.id) {
            // I paid, others owe me
            owedMap.set(splitUserId, (owedMap.get(splitUserId) || 0) + amt);
          } else if (splitUserId === user.id) {
            // Others paid, I owe them
            oweMap.set(payerId, (oweMap.get(payerId) || 0) + amt);
          }
        } else {
          // bonus/refund income: payer owes split users (reverse direction)
          if (payerId === user.id) {
            // I received, I owe others (their share of the bonus)
            oweMap.set(splitUserId, (oweMap.get(splitUserId) || 0) + amt);
          } else if (splitUserId === user.id) {
            // Others received, they owe me my share
            owedMap.set(payerId, (owedMap.get(payerId) || 0) + amt);
          }
        }
      }

      // Apply repayments from settlements
      let settlementsQuery = supabase
        .from('settlements')
        .select('sender_id, receiver_id, amount, date, created_at')
        .eq('ledger_id', activeLedger.id);

      if (dateMode === "range") {
        // Use date field if it exists, otherwise fallback to created_at
        // (Better to query both and filter in memory if schema is uncertain, but here we try simple)
        settlementsQuery = settlementsQuery
          .gte('created_at', startStr)
          .lte('created_at', endStr + 'T23:59:59Z');
      }

      const { data: repayments } = await settlementsQuery;

      for (const r of (repayments as any[]) || []) {
        const senderId = r.sender_id;
        const receiverId = r.receiver_id;
        const amt = Number(r.amount || 0);
        if (!senderId || !receiverId || amt <= 0) continue;

        if (receiverId === user.id) {
          // Someone repaid me => they owe me less
          if (owedMap.has(senderId)) {
            owedMap.set(senderId, owedMap.get(senderId)! - amt);
          } else {
            // If they didn't owe me but paid me, it becomes I owe them
            oweMap.set(senderId, (oweMap.get(senderId) || 0) + amt);
          }
        } else if (senderId === user.id) {
          // I repaid someone => I owe them less
          if (oweMap.has(receiverId)) {
            oweMap.set(receiverId, oweMap.get(receiverId)! - amt);
          } else {
            // If I didn't owe them but paid them, it becomes they owe me
            owedMap.set(receiverId, (owedMap.get(receiverId) || 0) + amt);
          }
        }
      }

      // Convert to display rows and net out (I can't both owe someone and be owed by them)
      const finalOweList: OutstandingRow[] = [];
      const finalOwedList: OutstandingRow[] = [];

      const allCounterparties = new Set([...oweMap.keys(), ...owedMap.keys()]);
      
      allCounterparties.forEach(cid => {
        const p = profileById.get(cid);
        const name = p?.full_name || "Unknown";
        const avatar = p?.avatar_url || null;
        
        const myDebt = oweMap.get(cid) || 0;
        const theirDebt = owedMap.get(cid) || 0;
        const net = theirDebt - myDebt;

        if (net > 0.01) {
          finalOwedList.push({ id: cid, name, avatar, amount: net });
        } else if (net < -0.01) {
          finalOweList.push({ id: cid, name, avatar, amount: Math.abs(net) });
        }
      });

      setWhoIOwe(finalOweList.sort((a, b) => b.amount - a.amount));
      setWhoOwesMe(finalOwedList.sort((a, b) => b.amount - a.amount));
    } finally {
      setLoading(false);
    }
  }, [activeLedger?.id, activeLedger?.type, dateMode, endDate, startDate, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!activeLedger?.id) {
    return <Loading fullScreen message="Loading..." />;
  }

  return (
    <div className="w-full max-w-md bg-background-light min-h-screen flex flex-col relative overflow-hidden mx-auto">
      <header className="pt-8 pb-4 px-6 flex items-center justify-between z-10">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm text-text-main hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <button
          onClick={() => setShowDatePicker(true)}
          className="flex items-center gap-2 bg-white py-2 px-5 rounded-full shadow-sm hover:shadow-md transition-all duration-300"
        >
          <span className="text-sm font-bold text-text-main tracking-tight">
            {dateMode === "all" ? "All" : formatRange(startDate, endDate)}
          </span>
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>
            keyboard_arrow_down
          </span>
        </button>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-10 px-6 pt-2">
        <h1 className="text-2xl font-bold text-text-main mb-6 text-center">Outstanding Details</h1>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
              I Owe Who <span className="text-text-muted font-normal text-sm">(Who I Owe)</span>
            </h2>
          </div>
          <div className="bg-white rounded-card p-2 shadow-soft flex flex-col gap-1">
            {whoIOwe.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <div className="h-px bg-gray-50 mx-3"></div>}
                <div className="flex items-center p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                    {item.avatar ? (
                      <img alt={item.name} src={item.avatar} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {item.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 ml-4 overflow-hidden">
                    <h3 className="font-bold text-text-main text-sm truncate">{item.name}</h3>
                  </div>
                  <div className="text-right ml-2">
                    <span className="block font-bold text-red-500 text-base">-${item.amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
            {!loading && whoIOwe.length === 0 && <div className="p-4 text-center text-sm text-text-muted">-</div>}
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
              Who Owes Me <span className="text-text-muted font-normal text-sm">(Who Owes Me)</span>
            </h2>
          </div>
          <div className="bg-white rounded-card p-2 shadow-soft flex flex-col gap-1">
            {whoOwesMe.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <div className="h-px bg-gray-50 mx-3"></div>}
                <div className="flex items-center p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                    {item.avatar ? (
                      <img alt={item.name} src={item.avatar} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {item.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 ml-4 overflow-hidden">
                    <h3 className="font-bold text-text-main text-sm truncate">{item.name}</h3>
                  </div>
                  <div className="text-right ml-2">
                    <span className="block font-bold text-primary text-base">+${item.amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
            {!loading && whoOwesMe.length === 0 && <div className="p-4 text-center text-sm text-text-muted">-</div>}
          </div>
        </div>
      </main>

      <DateRangePickerModal
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onConfirm={(start, end) => {
          setStartDate(start);
          setEndDate(end);
          setDateMode("range");
          setShowDatePicker(false);
        }}
        initialStartDate={startDate}
        initialEndDate={endDate}
      />
    </div>
  );
}
 