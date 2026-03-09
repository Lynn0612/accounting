"use client";

import { memo } from "react";

const BalanceCardSkeleton = memo(function BalanceCardSkeleton() {
  return (
    <div className="bg-surface-light rounded-card p-6 shadow-soft mt-2 animate-pulse">
      <div className="flex flex-col items-center justify-center">
        <div className="h-4 bg-gray-200 rounded w-24 mb-1"></div>
        <div className="h-12 bg-gray-200 rounded w-32 mb-6"></div>
        <div className="w-32 h-32 rounded-full bg-gray-200"></div>
      </div>
    </div>
  ); 
});

BalanceCardSkeleton.displayName = "BalanceCardSkeleton";

export default BalanceCardSkeleton;

