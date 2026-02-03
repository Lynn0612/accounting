import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

interface MemberBalance {
  userId: string;
  fullName: string;
  lineUserId: string | null;
  paid: number;
  owed: number;
  balance: number;
}

interface SettlementDetail {
  toUserId: string;
  toUserName: string;
  amount: number;
}

interface SettlementDetailReceived {
  fromUserId: string;
  fromUserName: string;
  amount: number;
}

serve(async (req) => {
  try { 
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    
    const startDate = lastMonth.toISOString().split('T')[0];
    const endDate = lastMonthEnd.toISOString().split('T')[0];

    const { data: members, error: membersError } = await supabase
      .from("ledger_members")
      .select(`
        user_id,
        ledger_id,
        profiles(id, full_name, line_user_id)
      `)
      .eq("line_notifications_enabled", true);

    if (membersError) {
      console.error("Error fetching members:", membersError);
      return new Response(JSON.stringify({ error: membersError.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!members || members.length === 0) {
      return new Response("No members to notify", { status: 200 });
    }

    const ledgerIds = [...new Set(members.map((m: any) => m.ledger_id))];

    for (const ledgerId of ledgerIds) {
      const ledgerMembers = members.filter((m: any) => m.ledger_id === ledgerId);

      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("id, amount, payer_id, type, date")
        .eq("ledger_id", ledgerId)
        .eq("type", "expense")
        .gte("date", startDate)
        .lte("date", endDate);

      if (txError) {
        console.error(`Error fetching transactions for ledger ${ledgerId}:`, txError);
        continue;
      }

      if (!transactions || transactions.length === 0) {
        continue;
      }

      const transactionIds = transactions.map(t => t.id);

      const { data: splits, error: splitsError } = await supabase
        .from("transaction_splits")
        .select("transaction_id, user_id, amount")
        .in("transaction_id", transactionIds);

      if (splitsError) {
        console.error(`Error fetching splits for ledger ${ledgerId}:`, splitsError);
        continue;
      }

      const { data: incomeTransactions, error: incomeError } = await supabase
        .from("transactions")
        .select("id, amount, type")
        .eq("ledger_id", ledgerId)
        .eq("type", "income")
        .gte("date", startDate)
        .lte("date", endDate);

      if (incomeError) {
        console.error(`Error fetching income for ledger ${ledgerId}:`, incomeError);
      }

      const totalIncome = incomeTransactions?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;
      const totalExpense = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const memberBalances: Map<string, MemberBalance> = new Map();

      for (const member of ledgerMembers) {
        const profile = (member as any).profiles;
        if (!profile || !profile.line_user_id) continue;

        memberBalances.set(member.user_id, {
          userId: member.user_id,
          fullName: profile.full_name || "Unknown",
          lineUserId: profile.line_user_id,
          paid: 0,
          owed: 0,
          balance: 0,
        });
      }

      for (const transaction of transactions) {
        const payerId = transaction.payer_id;
        const transactionSplits = splits?.filter(s => s.transaction_id === transaction.id) || [];
        const totalSplit = transactionSplits.reduce((sum, s) => sum + Number(s.amount || 0), 0);

        if (memberBalances.has(payerId)) {
          const payer = memberBalances.get(payerId)!;
          payer.paid += Number(transaction.amount || 0);
          memberBalances.set(payerId, payer);
        }

        for (const split of transactionSplits) {
          if (memberBalances.has(split.user_id)) {
            const member = memberBalances.get(split.user_id)!;
            member.owed += Number(split.amount || 0);
            memberBalances.set(split.user_id, member);
          }
        }
      }

      for (const [userId, member] of memberBalances.entries()) {
        member.balance = member.paid - member.owed;
        memberBalances.set(userId, member);
      }

      const creditors: MemberBalance[] = [];
      const debtors: MemberBalance[] = [];

      for (const member of memberBalances.values()) {
        if (member.balance > 0.01) {
          creditors.push({ ...member });
        } else if (member.balance < -0.01) {
          debtors.push({ ...member });
        }
      }

      creditors.sort((a, b) => b.balance - a.balance);
      debtors.sort((a, b) => a.balance - b.balance);

      const settlements: Map<string, SettlementDetail[]> = new Map();
      const settlementsReceived: Map<string, SettlementDetailReceived[]> = new Map();

      const workingCreditors = creditors.map(c => ({ ...c }));

      for (const debtor of debtors) {
        let remainingDebt = Math.abs(debtor.balance);
        const debtorSettlements: SettlementDetail[] = [];

        for (let i = 0; i < workingCreditors.length && remainingDebt > 0.01; i++) {
          const creditor = workingCreditors[i];
          if (creditor.balance <= 0.01) continue;

          const payment = Math.min(remainingDebt, creditor.balance);
          debtorSettlements.push({
            toUserId: creditor.userId,
            toUserName: creditor.fullName,
            amount: payment,
          });

          if (!settlementsReceived.has(creditor.userId)) {
            settlementsReceived.set(creditor.userId, []);
          }
          settlementsReceived.get(creditor.userId)!.push({
            fromUserId: debtor.userId,
            fromUserName: debtor.fullName,
            amount: payment,
          });

          remainingDebt -= payment;
          creditor.balance -= payment;
        }

        if (debtorSettlements.length > 0) {
          settlements.set(debtor.userId, debtorSettlements);
        }
      }

      for (const member of memberBalances.values()) {
        if (!member.lineUserId) continue;

        const memberSettlements = settlements.get(member.userId) || [];
        const memberSettlementsReceived = settlementsReceived.get(member.userId) || [];

        let settlementText = "";
        let settlementReceivedText = "";

        if (memberSettlements.length > 0) {
          settlementText = memberSettlements
            .map(s => `應付 ${Math.round(s.amount)} 元給 ${s.toUserName}`)
            .join("\n");
        }

        if (memberSettlementsReceived.length > 0) {
          settlementReceivedText = memberSettlementsReceived
            .map(s => `應收 ${Math.round(s.amount)} 元從 ${s.fromUserName}`)
            .join("\n");
        }

        const monthName = lastMonth.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });

        const flexMessage = {
          type: "flex",
          altText: `${monthName} 帳務摘要`,
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: `${monthName} 帳務摘要`,
                  weight: "bold",
                  size: "xl",
                  color: "#FFFFFF"
                }
              ],
              backgroundColor: "#1DB446",
              paddingAll: "20px"
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "Total Income",
                      size: "sm",
                      color: "#666666"
                    },
                    {
                      type: "text",
                      text: `$${Math.round(totalIncome).toLocaleString()}`,
                      size: "xl",
                      weight: "bold",
                      color: "#1DB446",
                      margin: "sm"
                    }
                  ],
                  margin: "md"
                },
                {
                  type: "separator",
                  margin: "md"
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "總支出",
                      size: "sm",
                      color: "#666666"
                    },
                    {
                      type: "text",
                      text: `$${Math.round(totalExpense).toLocaleString()}`,
                      size: "xl",
                      weight: "bold",
                      color: "#FF6B6B",
                      margin: "sm"
                    }
                  ],
                  margin: "md"
                },
                {
                  type: "separator",
                  margin: "md"
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "您的結算",
                      size: "sm",
                      color: "#666666",
                      weight: "bold"
                    },
                    {
                      type: "text",
                      text: member.balance > 0 
                        ? `應收回 $${Math.round(member.balance).toLocaleString()}`
                        : member.balance < 0
                        ? `應支付 $${Math.round(Math.abs(member.balance)).toLocaleString()}`
                        : "收支平衡",
                      size: "lg",
                      weight: "bold",
                      color: member.balance > 0 ? "#1DB446" : member.balance < 0 ? "#FF6B6B" : "#666666",
                      margin: "sm"
                    }
                  ],
                  margin: "md"
                }
              ],
              paddingAll: "20px"
            }
          }
        };

        if (settlementText || settlementReceivedText) {
          const settlementContents: any[] = [];

          if (settlementReceivedText) {
            settlementContents.push({
              type: "separator",
              margin: "md"
            });
            settlementContents.push({
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "應收款項",
                  size: "sm",
                  color: "#666666",
                  weight: "bold"
                },
                {
                  type: "text",
                  text: settlementReceivedText,
                  size: "sm",
                  color: "#1DB446",
                  wrap: true,
                  margin: "sm"
                }
              ],
              margin: "md"
            });
          }

          if (settlementText) {
            settlementContents.push({
              type: "separator",
              margin: "md"
            });
            settlementContents.push({
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "應付款項",
                  size: "sm",
                  color: "#666666",
                  weight: "bold"
                },
                {
                  type: "text",
                  text: settlementText,
                  size: "sm",
                  color: "#FF6B6B",
                  wrap: true,
                  margin: "sm"
                }
              ],
              margin: "md"
            });
          }

          (flexMessage.contents.body as any).contents.push(...settlementContents);
        }

        try {
          const response = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${LINE_TOKEN}`
            },
            body: JSON.stringify({
              to: member.lineUserId,
              messages: [flexMessage]
            })
          });

          if (!response.ok) {
            const errorData = await response.text();
            console.error(`Failed to send message to ${member.lineUserId}:`, errorData);
          }
        } catch (error) {
          console.error(`Error sending message to ${member.lineUserId}:`, error);
        }
      }
    }

    return new Response("Monthly notifications sent!", { status: 200 });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

