import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

// Get last month's date range (UTC+8 Taipei time)
// If monthParam is provided (format: YYYY-MM), use that month instead of last month
function getLastMonthRange(monthParam?: string) {
  let targetDate: Date;
  
  if (monthParam) {
    // Parse month parameter (YYYY-MM)
    const [yearStr, monthStr] = monthParam.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new Error(`Invalid month parameter: ${monthParam}. Use format YYYY-MM`);
    }
    targetDate = new Date(year, month - 1, 1); // month is 0-indexed
  } else {
    // Get current time in Taipei (UTC+8)
    const now = new Date();
    const taipeiOffset = 8 * 60; // UTC+8 in minutes
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const taipeiTime = new Date(utc + (taipeiOffset * 60000));
    
    // Calculate last month
    targetDate = new Date(taipeiTime.getFullYear(), taipeiTime.getMonth() - 1, 1);
  }
  
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1; // 0-indexed month
  
  // Calculate start and end of the target month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
  
  // For query, use next day with 'lt' to include all records on the end date
  const endDateNextDay = new Date(year, month, 1); // First day of next month
  const endDateNextDayStr = `${endDateNextDay.getFullYear()}-${String(endDateNextDay.getMonth() + 1).padStart(2, '0')}-01`;
  
  return { year, month, startDate, endDate, endDateNextDayStr };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Check for month parameter in query string (for manual triggering)
    const url = new URL(req.url);
    const monthParam = url.searchParams.get('month');
    
    console.log("Starting LINE ledger summary...", monthParam ? `for month: ${monthParam}` : "for last month");

    // Get all users with notifications enabled from ledger_members
    const { data: ledgerUsers, error: ledgerError } = await supabase
      .from("ledger_members")
      .select("user_id")
      .eq("line_notifications_enabled", true);

    // Get all users with notifications enabled from book_members
    const { data: bookUsers, error: bookError } = await supabase
      .from("book_members")
      .select("user_id")
      .eq("is_notify_enabled", true);

    if (ledgerError) console.error("Error fetching ledger_members:", ledgerError);
    if (bookError) console.error("Error fetching book_members:", bookError);

    // Combine and deduplicate user IDs
    const allUserIds = new Set<string>();
    ledgerUsers?.forEach(u => allUserIds.add(u.user_id));
    bookUsers?.forEach(u => allUserIds.add(u.user_id));

    const userIds = Array.from(allUserIds);
    console.log(`Found ${userIds.length} users with notifications enabled:`, userIds);

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users with notifications enabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get date range (supports month parameter for manual triggering)
    const { year, month, startDate, endDate, endDateNextDayStr } = getLastMonthRange(monthParam || undefined);
    
    console.log(`Date range: ${startDate} to ${endDate} (query: gte ${startDate} AND lt ${endDateNextDayStr})`);

    const results: { userId: string; success: boolean; error?: string }[] = [];

    for (const userId of userIds) {
      try {
        await processUser(userId, startDate, endDateNextDayStr, year, month);
        results.push({ userId, success: true });
      } catch (err) {
        console.error(`Error processing user ${userId}:`, err);
        results.push({ userId, success: false, error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({ message: "Completed", results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processUser(userId: string, startDate: string, endDateNextDayStr: string, year: number, month: number) {
  console.log(`Processing user: ${userId} for ${year}/${String(month).padStart(2, '0')}`);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("line_user_id, full_name")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    console.log(`No profile found for user ${userId}`, profileError);
    return;
  }

  if (!profile.line_user_id) {
    console.log(`User ${userId} has no LINE user ID`);
    return;
  }

  // Get all ledgers with notifications enabled for this user
  const { data: ledgerMemberships } = await supabase
    .from("ledger_members")
    .select("ledger_id, ledgers(id, name)")
    .eq("user_id", userId)
    .eq("line_notifications_enabled", true);

  // Get all books with notifications enabled for this user
  const { data: bookMemberships } = await supabase
    .from("book_members")
    .select("book_id, account_books(id, name)")
    .eq("user_id", userId)
    .eq("is_notify_enabled", true);

  const ledgers: Array<{ id: string; name: string; type: string; isMultiMember: boolean }> = [];

  // Check if ledger has multiple members
  for (const m of ledgerMemberships || []) {
    if ((m as any).ledgers) {
      const { count } = await supabase
        .from("ledger_members")
        .select("*", { count: 'exact', head: true })
        .eq("ledger_id", (m as any).ledgers.id);
      
      ledgers.push({ 
        id: (m as any).ledgers.id, 
        name: (m as any).ledgers.name, 
        type: 'ledger',
        isMultiMember: (count || 0) > 1
      });
    }
  }

  // Check if book has multiple members
  for (const m of bookMemberships || []) {
    if ((m as any).account_books) {
      const { count } = await supabase
        .from("book_members")
        .select("*", { count: 'exact', head: true })
        .eq("book_id", (m as any).account_books.id);
      
      ledgers.push({ 
        id: (m as any).account_books.id, 
        name: (m as any).account_books.name, 
        type: 'account_book',
        isMultiMember: (count || 0) > 1
      });
    }
  }

  console.log(`Found ${ledgers.length} ledgers for user ${userId}`);

  if (ledgers.length === 0) {
    console.log(`No ledgers with notifications for user ${userId}`);
    return;
  }

  // Calculate all ledger summaries first
  let grandTotalExpense = 0;
  let grandTotalIncome = 0;
  const ledgerSummaries: string[] = [];

  for (const ledger of ledgers) {
    const summary = await calculateLedgerSummary(ledger, userId, startDate, endDateNextDayStr);
    grandTotalExpense += summary.totalExpense;
    grandTotalIncome += summary.totalIncome;
    ledgerSummaries.push(summary.text);
  }

  // Build final message
  let message = `📊 [${year}/${String(month).padStart(2, '0')}] 財務結算報告\n`;
  message += `━━━━━━━━━━━━━━━\n`;
  message += `🏆 全帳本總匯\n`;
  message += `總支出：$${grandTotalExpense.toLocaleString()}\n`;
  message += `總收入：$${grandTotalIncome.toLocaleString()}\n`;
  message += `━━━━━━━━━━━━━━━\n\n`;

  message += ledgerSummaries.join('\n\n');

  // Send LINE message
  console.log(`Sending LINE message to ${profile.line_user_id}`);
  await sendLineMessage(profile.line_user_id, message);
  console.log(`Sent LINE message to user ${userId}`);
}

interface LedgerSummaryResult {
  totalExpense: number;
  totalIncome: number;
  text: string;
}

async function calculateLedgerSummary(
  ledger: { id: string; name: string; type: string; isMultiMember: boolean },
  currentUserId: string,
  startDate: string,
  endDateNextDayStr: string
): Promise<LedgerSummaryResult> {
  const scopeColumn = ledger.type === 'account_book' ? 'book_id' : 'ledger_id';
  const ledgerTypeLabel = ledger.isMultiMember ? '多人' : '個人';

  // Fetch transactions for this ledger within date range
  // Use 'lt' with next day to include all records on the end date
  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("id, amount, type, payer_id, category_id, income_mode, expense_payment_source, is_public_expense, public_amount")
    .eq(scopeColumn, ledger.id)
    .gte("date", startDate)
    .lt("date", endDateNextDayStr);
  
  console.log(`Ledger ${ledger.name}: Found ${transactions?.length || 0} transactions in date range ${startDate} to ${endDateNextDayStr}`);

  if (txError || !transactions || transactions.length === 0) {
    return {
      totalExpense: 0,
      totalIncome: 0,
      text: `📒 ${ledger.name}(${ledgerTypeLabel})：\n總支出：$0\n總收入：$0\n📝 尚無交易記錄\n━━━━━━━━━━━━━━━`
    };
  }

  // Fetch transaction splits
  const { data: splits } = await supabase
    .from("transaction_splits")
    .select("transaction_id, user_id, amount")
    .eq(scopeColumn, ledger.id);

  const splitsMap = new Map<string, Array<{ user_id: string; amount: number }>>();
  for (const split of splits || []) {
    if (!splitsMap.has(split.transaction_id)) {
      splitsMap.set(split.transaction_id, []);
    }
    splitsMap.get(split.transaction_id)!.push({
      user_id: split.user_id,
      amount: Number(split.amount) || 0
    });
  }

  // Calculate totals and outstanding (like useOutstandingTotal)
  let totalExpense = 0;
  let totalIncome = 0;
  const categoryExpenses = new Map<string, number>();
  
  // Outstanding calculation per user (receivable - payable from current user's perspective)
  const receivableFrom = new Map<string, number>(); // others owe me
  const payableTo = new Map<string, number>(); // I owe others

  for (const tx of transactions) {
    const amount = Number(tx.amount) || 0;
    const txSplits = splitsMap.get(tx.id) || [];

    // Find current user's split amount
    const mySplit = txSplits.find(s => s.user_id === currentUserId);
    const myAmount = mySplit?.amount || 0;

    if (tx.type === "expense") {
      // Skip deposit-funded expenses for outstanding
      if (tx.expense_payment_source === 'deposit') continue;
      
      // Only count current user's portion for totals
      totalExpense += myAmount;

      // Track category expenses for top 3 (only user's portion)
      if (tx.category_id && myAmount > 0) {
        categoryExpenses.set(tx.category_id, (categoryExpenses.get(tx.category_id) || 0) + myAmount);
      }

      // Outstanding calculation (like useOutstandingTotal)
      const payerId = tx.payer_id;
      for (const split of txSplits) {
        if (split.user_id === payerId) continue; // payer doesn't owe themselves
        
        if (payerId === currentUserId && split.user_id !== currentUserId) {
          // I paid, others owe me
          receivableFrom.set(split.user_id, (receivableFrom.get(split.user_id) || 0) + split.amount);
        } else if (split.user_id === currentUserId && payerId !== currentUserId) {
          // Others paid, I owe them
          payableTo.set(payerId, (payableTo.get(payerId) || 0) + split.amount);
        }
      }
    }

    if (tx.type === "income") {
      // Only count current user's portion
      if (tx.income_mode !== 'deposit') {
        totalIncome += myAmount;
      }

      // bonus/refund income: payer owes split users (reverse direction)
      if (tx.income_mode === 'bonus' || tx.income_mode === 'refund') {
        const payerId = tx.payer_id;
        for (const split of txSplits) {
          if (split.user_id === payerId) continue;
          
          if (payerId === currentUserId && split.user_id !== currentUserId) {
            // I owe others (reverse)
            payableTo.set(split.user_id, (payableTo.get(split.user_id) || 0) + split.amount);
          } else if (split.user_id === currentUserId && payerId !== currentUserId) {
            // Others owe me (reverse)
            receivableFrom.set(payerId, (receivableFrom.get(payerId) || 0) + split.amount);
          }
        }
      }
    }
  }

  // Fetch settlements to offset outstanding (settlements always use ledger_id)
  const { data: settlementsReceived, error: srError } = await supabase
    .from("settlements")
    .select("amount, sender_id")
    .eq("ledger_id", ledger.id)
    .eq("receiver_id", currentUserId);

  const { data: settlementsPaid, error: spError } = await supabase
    .from("settlements")
    .select("amount, receiver_id")
    .eq("ledger_id", ledger.id)
    .eq("sender_id", currentUserId);

  console.log(`Settlements for ledger ${ledger.id}:`, {
    received: settlementsReceived,
    paid: settlementsPaid,
    srError,
    spError
  });

  // Apply settlements
  console.log(`Before settlements - receivableFrom:`, Object.fromEntries(receivableFrom));
  console.log(`Before settlements - payableTo:`, Object.fromEntries(payableTo));

  for (const s of settlementsReceived || []) {
    const amt = Number(s.amount) || 0;
    const senderId = s.sender_id;
    console.log(`Settlement received from ${senderId}: $${amt}`);
    // Someone paid me, reduce what they owe me
    receivableFrom.set(senderId, (receivableFrom.get(senderId) || 0) - amt);
  }

  for (const s of settlementsPaid || []) {
    const amt = Number(s.amount) || 0;
    const receiverId = s.receiver_id;
    console.log(`Settlement paid to ${receiverId}: $${amt}`);
    // I paid someone, reduce what I owe them
    payableTo.set(receiverId, (payableTo.get(receiverId) || 0) - amt);
  }

  console.log(`After settlements - receivableFrom:`, Object.fromEntries(receivableFrom));
  console.log(`After settlements - payableTo:`, Object.fromEntries(payableTo));

  // Get category names for top 3
  const categoryIds = Array.from(categoryExpenses.keys());
  let categoryMap = new Map<string, { name: string; icon: string }>();
  
  if (categoryIds.length > 0) {
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name, icon")
      .in("id", categoryIds);

    for (const c of categories || []) {
      categoryMap.set(c.id, { name: c.name, icon: c.icon || '📦' });
    }
  }

  // Get top 3 categories
  const topCategories = Array.from(categoryExpenses.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([catId, amount]) => {
      const cat = categoryMap.get(catId);
      const percentage = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
      return { name: cat?.name || 'Unknown', icon: cat?.icon || '📦', amount, percentage };
    });

  // Get profiles for outstanding users
  const outstandingUserIds = new Set<string>();
  receivableFrom.forEach((_, uid) => outstandingUserIds.add(uid));
  payableTo.forEach((_, uid) => outstandingUserIds.add(uid));
  
  let profileMap = new Map<string, string>();
  
  if (outstandingUserIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(outstandingUserIds));

    for (const p of profiles || []) {
      profileMap.set(p.id, p.full_name || 'Unknown');
    }
  }

  // Build text
  let text = `📒 ${ledger.name}(${ledgerTypeLabel})：\n`;
  text += `總支出：$${totalExpense.toLocaleString()}\n`;
  text += `總收入：$${totalIncome.toLocaleString()}\n`;

  // Outstanding (only for multi-member ledgers)
  if (ledger.isMultiMember) {
    const receivables: string[] = [];
    const payables: string[] = [];

    // 應收 (others owe me) - if negative, means I owe them
    for (const [uid, amt] of receivableFrom) {
      const name = profileMap.get(uid) || 'Unknown';
      if (amt > 0) {
        receivables.push(`💵 應收 ${name} $${Math.round(amt).toLocaleString()}`);
      } else if (amt < 0) {
        // Negative receivable = I owe them
        payables.push(`⚠️ 應付 ${name} $${Math.round(Math.abs(amt)).toLocaleString()}`);
      }
    }

    // 應付 (I owe others) - if negative, means they owe me
    for (const [uid, amt] of payableTo) {
      const name = profileMap.get(uid) || 'Unknown';
      if (amt > 0) {
        payables.push(`⚠️ 應付 ${name} $${Math.round(amt).toLocaleString()}`);
      } else if (amt < 0) {
        // Negative payable = they owe me
        receivables.push(`💵 應收 ${name} $${Math.round(Math.abs(amt)).toLocaleString()}`);
      }
    }

    if (receivables.length > 0) {
      text += `\n${receivables.join('\n')}\n`;
    }
    if (payables.length > 0) {
      text += `\n${payables.join('\n')}\n`;
    }
  }

  // Top 3 categories
  if (topCategories.length > 0) {
    const medals = ['1️⃣', '2️⃣', '3️⃣'];
    text += `\nTOP `;
    topCategories.forEach((_, i) => text += medals[i]);
    text += `\n`;
    
    topCategories.forEach((cat, i) => {
      text += `${cat.icon} ${cat.name} ${cat.percentage}%\n`;
    });
  }

  text += `━━━━━━━━━━━━━━━`;

  return { totalExpense, totalIncome, text };
}

async function sendLineMessage(lineUserId: string, text: string) {
  console.log(`Sending to LINE user: ${lineUserId}`);

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`LINE API error: ${response.status} - ${errorText}`);
    throw new Error(`LINE API error: ${response.status} - ${errorText}`);
  }

  return response;
}
