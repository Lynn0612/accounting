"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { formatTransactionAmount } from "@/utils/formatAmount";

interface TransactionCardProps {
  id: string;
  title: string;
  date: string;
  categoryName: string;
  amount: number;
  amountPrefix: string;
  amountColor: string;
  payerText: string;
  categoryIcon: string;
  iconBg: string;
}

const TransactionCard = memo(function TransactionCard({
  id,
  title,
  date,
  categoryName,
  amount,
  amountPrefix,
  amountColor,
  payerText,
  categoryIcon,
  iconBg,
}: TransactionCardProps) {
  const formattedAmount = useMemo(
    () => formatTransactionAmount(amount, amountPrefix === '+' ? 'income' : 'expense'),
    [amount, amountPrefix]
  );

  return (
    <Link
      href={`/edit/${id}`}
      className="group flex items-center bg-white p-4 rounded-[16px] shadow-sm hover:shadow-md transition-all cursor-pointer"
    >
      <div className={`w-12 h-12 flex items-center justify-center ${iconBg} rounded-full text-2xl shrink-0`}>
        {categoryIcon}
      </div>
      <div className="flex flex-1 flex-col ml-4 overflow-hidden">
        <h4 className="text-[#1e293b] font-bold text-sm truncate">
          {title}
        </h4>
        <p className="text-[#718096] text-xs mt-0.5">
          {date} • {categoryName}
        </p>
      </div>
      <div className="text-right">
        <p className={`${amountColor} font-bold text-base`}>
          {formattedAmount}
        </p>
        {!!payerText && (
          <p className="text-xs text-[#718096]">
            {payerText}
          </p>
        )}
      </div>
    </Link>
  );
});

TransactionCard.displayName = "TransactionCard";

export default TransactionCard;

