import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

/**
 * Manual trigger endpoint for LINE monthly report
 * 
 * Usage:
 * GET /api/test/send-report?month=2026-01
 * 
 * This endpoint directly sends LINE messages for the specified month
 * Date range: 2026-01-01 00:00:00 (Asia/Taipei) to 2026-01-31 23:59:59 (Asia/Taipei)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Helper function to calculate date range for a given month in Asia/Taipei timezone
function getMonthRange(monthParam: string) {
  const [yearStr, monthStr] = monthParam.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month parameter: ${monthParam}. Use format YYYY-MM`);
  }
  
  // Calculate start date: first day of month at 00:00:00 Asia/Taipei
  // We'll use UTC and convert to Asia/Taipei (UTC+8)
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  // Subtract 8 hours to get Asia/Taipei time (UTC+8 means we need to subtract 8 hours from UTC to get local time)
  // Actually, we want to represent the local time in UTC, so we add 8 hours
  const taipeiStart = new Date(startDate.getTime() - 8 * 60 * 60 * 1000);
  
  // Calculate end date: last day of month at 23:59:59 Asia/Taipei
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59));
  const taipeiEnd = new Date(endDate.getTime() - 8 * 60 * 60 * 1000);
  
  // Format as YYYY-MM-DD for database queries
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const endDateNextDay = new Date(year, month, 1); // First day of next month
  const endDateNextDayStr = `${endDateNextDay.getFullYear()}-${String(endDateNextDay.getMonth() + 1).padStart(2, '0')}-01`;
  
  return { year, month, startDateStr, endDateStr, endDateNextDayStr, taipeiStart, taipeiEnd };
}

// Helper function to send LINE message
async function sendLineMessage(lineUserId: string, text: string, lineToken: string) {
  
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${lineToken}`
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API error: ${response.status} - ${errorText}`);
  }
  
  return response;
}

// Calculate ledger summary (reused from Edge Function)
async function calculateLedgerSummary(
  supabase: any,
  ledger: { id: string; name: string; type: string; isMultiMember: boolean },
  currentUserId: string,
  startDateStr: string,
  endDateNextDayStr: string
) {
  const scopeColumn = ledger.type === 'account_book' ? 'book_id' : 'ledger_id';
  const ledgerTypeLabel = ledger.isMultiMember ? '多人' : '個人';
  
  // Fetch transactions
  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("id, amount, type, payer_id, category_id, income_mode, expense_payment_source, is_public_expense, public_amount")
    .eq(scopeColumn, ledger.id)
    .gte("date", startDateStr)
    .lt("date", endDateNextDayStr);
  
  if (txError || !transactions || transactions.length === 0) {
    return {
      totalExpense: 0,
      totalIncome: 0,
      totalPublicExpense: 0,
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
  
  // Calculate totals
  let totalExpense = 0;
  let totalIncome = 0;
  let totalPublicExpense = 0;
  
  for (const tx of transactions) {
    const txSplits = splitsMap.get(tx.id) || [];
    const mySplit = txSplits.find(s => s.user_id === currentUserId);
    const myAmount = mySplit?.amount || 0;
    
    if (tx.type === "expense") {
      if (tx.expense_payment_source === 'deposit') continue;
      totalExpense += myAmount;
      
      // Calculate public expense
      if (tx.is_public_expense === true && tx.public_amount != null) {
        totalPublicExpense += Number(tx.public_amount);
      }
    }
    
    if (tx.type === "income") {
      if (tx.income_mode !== 'deposit') {
        totalIncome += myAmount;
      }
    }
  }
  
  // Build text
  let text = `📒 ${ledger.name}(${ledgerTypeLabel})：\n`;
  text += `總支出：$${totalExpense.toLocaleString()}\n`;
  text += `總收入：$${totalIncome.toLocaleString()}\n`;
  
  if (ledger.isMultiMember && totalPublicExpense > 0) {
    text += `公費總支出：$${totalPublicExpense.toLocaleString()}\n`;
  }
  
  text += `━━━━━━━━━━━━━━━`;
  
  return { totalExpense, totalIncome, totalPublicExpense, text };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    
    if (!month) {
      return NextResponse.json(
        { error: "Missing 'month' parameter. Use format: YYYY-MM (e.g., 2026-01)" },
        { status: 400 }
      );
    }
    
    // Validate month format
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM (e.g., 2026-01)" },
        { status: 400 }
      );
    }
    
    // Calculate date range
    const { year, month: monthNum, startDateStr, endDateStr, endDateNextDayStr, taipeiStart, taipeiEnd } = getMonthRange(month);
    
    // Initialize Supabase client
    // Try multiple possible environment variable names
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { 
          error: "Missing Supabase configuration",
          details: {
            hasSupabaseUrl: !!supabaseUrl,
            hasSupabaseServiceKey: !!supabaseServiceKey,
            hasLineToken: !!lineToken,
            envVars: {
              NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
              SUPABASE_URL: !!process.env.SUPABASE_URL,
              SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
              NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
              LINE_CHANNEL_ACCESS_TOKEN: !!process.env.LINE_CHANNEL_ACCESS_TOKEN
            }
          }
        },
        { status: 500 }
      );
    }
    
    if (!lineToken) {
      return NextResponse.json(
        { 
          error: "Missing LINE_CHANNEL_ACCESS_TOKEN",
          details: {
            hasSupabaseUrl: !!supabaseUrl,
            hasSupabaseServiceKey: !!supabaseServiceKey,
            hasLineToken: false
          }
        },
        { status: 500 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get all users with notifications enabled
    const { data: ledgerUsers } = await supabase
      .from("ledger_members")
      .select("user_id")
      .eq("line_notifications_enabled", true);
    
    const { data: bookUsers } = await supabase
      .from("book_members")
      .select("user_id")
      .eq("is_notify_enabled", true);
    
    const allUserIds = new Set<string>();
    ledgerUsers?.forEach(u => allUserIds.add(u.user_id));
    bookUsers?.forEach(u => allUserIds.add(u.user_id));
    
    const userIds = Array.from(allUserIds);
    
    if (userIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with notifications enabled",
        dateRange: {
          start: taipeiStart.toISOString(),
          end: taipeiEnd.toISOString(),
          startDateStr,
          endDateNextDayStr
        },
        totals: { expense: 0, income: 0, publicExpense: 0 }
      });
    }
    
    const results: Array<{ userId: string; success: boolean; error?: string; totals?: any }> = [];
    let grandTotalExpense = 0;
    let grandTotalIncome = 0;
    let grandTotalPublicExpense = 0;
    
    // Process each user
    for (const userId of userIds) {
      try {
        // Get user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("line_user_id, full_name")
          .eq("id", userId)
          .single();
        
        if (!profile || !profile.line_user_id) {
          results.push({ userId, success: false, error: "No LINE user ID" });
          continue;
        }
        
        // Get ledgers
        const { data: ledgerMemberships } = await supabase
          .from("ledger_members")
          .select("ledger_id, ledgers(id, name)")
          .eq("user_id", userId)
          .eq("line_notifications_enabled", true);
        
        const { data: bookMemberships } = await supabase
          .from("book_members")
          .select("book_id, account_books(id, name)")
          .eq("user_id", userId)
          .eq("is_notify_enabled", true);
        
        const ledgers: Array<{ id: string; name: string; type: string; isMultiMember: boolean }> = [];
        
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
        
        if (ledgers.length === 0) {
          results.push({ userId, success: false, error: "No ledgers with notifications" });
          continue;
        }
        
        // Calculate summaries
        let userTotalExpense = 0;
        let userTotalIncome = 0;
        let userTotalPublicExpense = 0;
        const ledgerSummaries: string[] = [];
        
        for (const ledger of ledgers) {
          const summary = await calculateLedgerSummary(supabase, ledger, userId, startDateStr, endDateNextDayStr);
          userTotalExpense += summary.totalExpense;
          userTotalIncome += summary.totalIncome;
          userTotalPublicExpense += summary.totalPublicExpense;
          ledgerSummaries.push(summary.text);
        }
        
        grandTotalExpense += userTotalExpense;
        grandTotalIncome += userTotalIncome;
        grandTotalPublicExpense += userTotalPublicExpense;
        
        // Build message
        let message = `📊 [${year}/${String(monthNum).padStart(2, '0')}] 財務結算報告\n`;
        message += `━━━━━━━━━━━━━━━\n`;
        message += `🏆 全帳本總匯\n`;
        message += `總支出：$${userTotalExpense.toLocaleString()}\n`;
        message += `總收入：$${userTotalIncome.toLocaleString()}\n`;
        message += `━━━━━━━━━━━━━━━\n\n`;
        message += ledgerSummaries.join('\n\n');
        
        // Send LINE message
        await sendLineMessage(profile.line_user_id, message, lineToken);
        
        results.push({
          userId,
          success: true,
          totals: {
            expense: userTotalExpense,
            income: userTotalIncome,
            publicExpense: userTotalPublicExpense
          }
        });
        
      } catch (err) {
        results.push({
          userId,
          success: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Report sent for ${year}/${String(monthNum).padStart(2, '0')}`,
      month: `${year}/${String(monthNum).padStart(2, '0')}`,
      dateRange: {
        start: taipeiStart.toISOString(),
        end: taipeiEnd.toISOString(),
        startDateStr,
        endDateNextDayStr,
        description: `${startDateStr} 00:00:00 (Asia/Taipei) to ${endDateStr} 23:59:59 (Asia/Taipei)`
      },
      totals: {
        expense: grandTotalExpense,
        income: grandTotalIncome,
        publicExpense: grandTotalPublicExpense
      },
      results
    });
    
  } catch (error) {
    console.error("Error sending report:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

