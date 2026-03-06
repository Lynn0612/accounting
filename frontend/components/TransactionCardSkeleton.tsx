"use client";

import { memo } from "react";

const TransactionCardSkeleton = memo(function TransactionCardSkeleton() {
  return (
    <div className="group flex items-center bg-white p-4 rounded-[16px] shadow-sm animate-pulse">
      <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0"></div>
      <div className="flex flex-1 flex-col ml-4 gap-2">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
      <div className="text-right space-y-2">
        <div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div>
        <div className="h-3 bg-gray-200 rounded w-12 ml-auto"></div>
      </div>
    </div>
  );
});

TransactionCardSkeleton.displayName = "TransactionCardSkeleton";

export default TransactionCardSkeleton;

