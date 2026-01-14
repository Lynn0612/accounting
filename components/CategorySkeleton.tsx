"use client";

import { memo } from "react";

const CategorySkeleton = memo(function CategorySkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-2xl animate-pulse">
      <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0"></div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        <div className="h-3 bg-gray-200 rounded w-1/4"></div>
      </div>
    </div>
  );
});

CategorySkeleton.displayName = "CategorySkeleton";

export default CategorySkeleton;

