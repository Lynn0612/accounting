import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { startOfMonth, endOfMonth } from "date-fns";
import HomePageClient from "@/components/HomePageClient";
import { cookies } from "next/headers";

async function getDashboardData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 如果 getUser() 失敗，嘗試從 Cookie 中解析 JWT 獲取用戶 ID
  let userId: string | null = user?.id || null;
  
  if (!userId) {
    const cookieStore = await cookies();
    const supabaseUrlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectRef = supabaseUrlEnv.split('//')[1]?.split('.')[0] || '';
    const authCookie = cookieStore.get(`sb-${projectRef}-auth-token`);
    
    if (authCookie?.value) {
      try {
        const cookieData = JSON.parse(authCookie.value);
        const accessToken = cookieData.access_token;
        
        if (accessToken) {
          // 解析 JWT payload（base64url decode）
          const parts = accessToken.split('.');
          if (parts.length === 3) {
            // Handle base64url decoding safely
            let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            // Add padding if needed
            while (base64.length % 4) {
              base64 += '=';
            }
            const payload = JSON.parse(
              Buffer.from(base64, 'base64').toString()
            );
            userId = payload.sub || null;
          }
        }
      } catch (e) {
        // 解析失敗，繼續使用 null
      }
    }
  }

  if (!userId) {
    redirect("/login");
  }

  // Get first ledger user is member of and fetch transactions in one query using join
  // Note: We don't fetch all ledgers here because useLedgers hook in HomePageClient handles that
  // Fetching all ledgers without proper filtering causes 406 errors due to RLS policies
  const { data: ledgerMembership } = await supabase
    .from('ledger_members')
    .select('ledger_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (!ledgerMembership) {
    return {
      totalIncome: 0,
      totalExpenses: 0,
      outstanding: 0,
      recentTransactions: [],
      activeBookName: "Account Book",
    };
  }

  const activeLedgerId = ledgerMembership.ledger_id;

  // Calculate current month date range using date-fns
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const startDateStr = monthStart.toISOString().split('T')[0];
  const endDateStr = monthEnd.toISOString();

  // Optimized: Fetch all data in parallel with joins
  // Note: We still fetch recentTransactions on server for initial render,
  // but it will be used as initialData in React Query to avoid duplicate fetching
  const fetchMonthlySplits = async (withExpensePaymentSource: boolean) => {
    const inner = withExpensePaymentSource
      ? `type, date, payer_id, expense_payment_source`
      : `type, date, payer_id`;
    return await supabase
      .from("transaction_splits")
      .select(`
        amount,
        transactions!inner (
          ${inner}
        )
      `)
      .eq("ledger_id", activeLedgerId)
      .eq("user_id", userId)
      .gte("transactions.date", startDateStr)
      .lte("transactions.date", endDateStr);
  };

  const fetchOutstandingSplits = async (withExpensePaymentSource: boolean) => {
    const inner = withExpensePaymentSource
      ? `payer_id, expense_payment_source`
      : `payer_id`;
    return await supabase
      .from("transaction_splits")
      .select(`
        amount,
        transactions!inner (
          ${inner}
        )
      `)
      .eq("ledger_id", activeLedgerId)
      .eq("user_id", userId);
  };

  const [splitsResult, outstandingSplitsResult, recentTransactionsResult] = await Promise.all([
    fetchMonthlySplits(true),
    fetchOutstandingSplits(true),
    // Recent transactions with categories and payer profiles in one query
    // Filter to current month to prioritize "New Month" focus
    // This will be used as initialData in React Query to avoid duplicate fetching
    supabase
      .from("transactions")
      .select(`
        id,
        amount,
        description,
        date,
        type,
        payer_id,
        category_id,
        created_at,
        categories (
          id,
          name,
          icon
        ),
        payer:profiles!transactions_payer_id_fkey (
          id,
          full_name
        )
      `)
      .eq("ledger_id", activeLedgerId)
      .gte("date", startDateStr)
      .lte("date", endDateStr)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  // Fallback if DB hasn't applied expense_payment_source yet
  const effectiveSplitsResult = splitsResult.error ? await fetchMonthlySplits(false) : splitsResult;
  const effectiveOutstandingSplitsResult = outstandingSplitsResult.error ? await fetchOutstandingSplits(false) : outstandingSplitsResult;

  const splits = effectiveSplitsResult.data || [];
  const outstandingSplits = effectiveOutstandingSplitsResult.data || [];
  const recentTransactions = (recentTransactionsResult.data || []).map((tx: any) => ({
        ...tx,
    payer: tx.payer || null,
      }));

  const totalIncome = splits
    .filter((s: any) => s.transactions?.type === "income")
    .reduce((sum, s) => sum + Number(s.amount), 0) || 0;

  const totalExpenses = splits
    .filter((s: any) => s.transactions?.type === "expense" && s.transactions?.expense_payment_source !== 'deposit')
    .reduce((sum, s) => sum + Number(s.amount), 0) || 0;

  // Calculate outstanding based on payer_id from transactions
  const paid = outstandingSplits
    .filter((s: any) => s.transactions?.expense_payment_source !== 'deposit' && s.transactions?.payer_id === userId)
    .reduce((sum, s) => sum + Number(s.amount), 0) || 0;
  const owed = outstandingSplits
    .filter((s: any) => s.transactions?.expense_payment_source !== 'deposit' && s.transactions?.payer_id !== userId)
    .reduce((sum, s) => sum + Number(s.amount), 0) || 0;
  const outstanding = owed - paid;

  return {
    totalIncome,
    totalExpenses,
    outstanding,
    recentTransactions,
    activeBookName: "Ledger",
    ledgers: [], // Empty array - useLedgers hook in HomePageClient will fetch ledgers properly
  };
}

export default async function HomePage() {
  const { totalIncome, totalExpenses, outstanding, recentTransactions, activeBookName, ledgers } = await getDashboardData();
  const percentage = totalIncome > 0 
    ? Math.min(100, Math.max(0, Math.round((totalExpenses / totalIncome) * 100))) 
    : 0;

  return (
    <HomePageClient
      totalIncome={totalIncome}
      totalExpenses={totalExpenses}
      outstanding={outstanding}
      recentTransactions={recentTransactions}
      percentage={percentage}
      activeBookName={activeBookName}
      initialLedgers={ledgers || []}
    />
  );
}
