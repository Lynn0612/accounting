"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import { useLedger } from "@/contexts/LedgerContext";

interface OutstandingItem {
  id: string;
  name: string;
  avatar: string;
  description: string;
  amount: number;
  isOwed: boolean;
}

interface OutstandingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OutstandingModal({ isOpen, onClose }: OutstandingModalProps) {
  const { activeLedger } = useLedger();
  const [whoIOwe, setWhoIOwe] = useState<OutstandingItem[]>([]);
  const [whoOwesMe, setWhoOwesMe] = useState<OutstandingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [endDate, setEndDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  );

  useEffect(() => {
    if (!isOpen || !activeLedger?.id) {
      setLoading(false);
      return;
    }

    async function fetchOutstandingDetails() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        setLoading(false);
        return;
      }

      const scopeColumn = activeLedger.type === "account_book" ? "book_id" : "ledger_id";

      const { data: splits } = await supabase
        .from("transaction_splits")
        .select(`
          id,
          amount,
          user_id,
          transaction_id,
          transactions!inner (
            id,
            description,
            payer_id,
            expense_payment_source,
            categories (
              name
            )
          ),
          profiles (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq(scopeColumn, activeLedger.id)
        .neq("transactions.expense_payment_source", "deposit");

      if (!splits) {
        setLoading(false);
        return;
      }

      const userOutstanding: Record<string, OutstandingItem> = {};

      splits.forEach((split: any) => {
        const userId = split.user_id;
        const amount = Number(split.amount);
        const profile = split.profiles;
        const transaction = split.transactions;
        const category = transaction?.categories;
        const isPayer = transaction?.payer_id === userId;

        if (!userOutstanding[userId]) {
          userOutstanding[userId] = {
            id: userId,
            name: profile?.full_name || "Unknown",
            avatar: profile?.avatar_url || "👤",
            description: transaction?.description || category?.name || "Transaction",
            amount: 0,
            isOwed: false,
          };
        }

        if (isPayer) {
          userOutstanding[userId].amount -= amount;
        } else {
          userOutstanding[userId].amount += amount;
        }
      });

      const oweList: OutstandingItem[] = [];
      const owedList: OutstandingItem[] = [];

      Object.values(userOutstanding).forEach((item) => {
        if (item.id === user.id) return; // Skip current user
        
        if (item.amount > 0) {
          owedList.push({ ...item, isOwed: false });
        } else if (item.amount < 0) {
          oweList.push({ ...item, amount: Math.abs(item.amount), isOwed: true });
        }
      });

      setWhoIOwe(oweList);
      setWhoOwesMe(owedList);
      setLoading(false);
    }

    fetchOutstandingDetails();
  }, [isOpen, activeLedger?.id, activeLedger?.type]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div 
        className="relative bg-background-light w-full max-w-md rounded-[24px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pt-8 pb-4 px-6 flex items-center justify-between z-10 bg-background-light">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm text-[#2D3748] hover:bg-gray-50 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDatePicker(true);
            }}
            className="flex items-center gap-2 bg-white py-2 px-5 rounded-full shadow-sm hover:shadow-md transition-all duration-300"
          >
            <span className="text-sm font-bold text-[#2D3748] tracking-tight">
              {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
              {endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>
              keyboard_arrow_down
            </span>
          </button>
          <div className="w-10"></div>
        </header>

        <main className="flex-1 overflow-y-auto no-scrollbar pb-10 px-6 pt-2">
          <h1 className="text-2xl font-bold text-[#2D3748] mb-6 text-center">Outstanding Details</h1>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-lg font-bold text-[#2D3748] flex items-center gap-2">
                我欠誰的錢 <span className="text-[#718096] font-normal text-sm">(Who I Owe)</span>
              </h2>
            </div>
            <div className="bg-white rounded-[24px] p-2 shadow-soft flex flex-col gap-1">
              {loading ? (
                <div className="p-4 text-center text-sm text-text-muted">Loading...</div>
              ) : whoIOwe.length > 0 ? (
                whoIOwe.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div className="h-px bg-gray-50 mx-3"></div>}
                    <div className="flex items-center p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center border-2 border-white shadow-sm shrink-0">
                        <span className="text-2xl">{item.avatar}</span>
                      </div>
                      <div className="flex-1 ml-4 overflow-hidden">
                        <h3 className="font-bold text-[#2D3748] text-sm truncate">{item.name}</h3>
                        <p className="text-xs text-[#718096] mt-0.5 truncate">{item.description}</p>
                      </div>
                      <div className="text-right ml-2">
                        <span className="block font-bold text-red-500 text-base">
                          -${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-text-muted">-</div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-lg font-bold text-[#2D3748] flex items-center gap-2">
                誰欠我的錢 <span className="text-[#718096] font-normal text-sm">(Who Owes Me)</span>
              </h2>
            </div>
            <div className="bg-white rounded-[24px] p-2 shadow-soft flex flex-col gap-1">
              {loading ? (
                <div className="p-4 text-center text-sm text-text-muted">Loading...</div>
              ) : whoOwesMe.length > 0 ? (
                whoOwesMe.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div className="h-px bg-gray-50 mx-3"></div>}
                    <div className="flex items-center p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center border-2 border-white shadow-sm shrink-0">
                        <span className="text-2xl">{item.avatar}</span>
                      </div>
                      <div className="flex-1 ml-4 overflow-hidden">
                        <h3 className="font-bold text-[#2D3748] text-sm truncate">{item.name}</h3>
                        <p className="text-xs text-[#718096] mt-0.5 truncate">{item.description}</p>
                      </div>
                      <div className="text-right ml-2">
                        <span className="block font-bold text-primary text-base">
                          +${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-text-muted">-</div>
              )}
            </div>
          </div>
        </main>

        <DateRangePickerModal
          isOpen={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onConfirm={(start, end) => {
            setStartDate(start);
            setEndDate(end);
            setShowDatePicker(false);
          }}
          initialStartDate={startDate}
          initialEndDate={endDate}
        />
      </div>
    </div>
  );
}
