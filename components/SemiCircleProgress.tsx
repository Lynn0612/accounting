"use client";

import React from "react";

interface SemiCircleProgressProps {
  percentage: number;
}

export default function SemiCircleProgress({ percentage }: SemiCircleProgressProps) {
  // Path length is 251, so:
  // - 0% → dashOffset = 251 (fully hidden/empty)
  // - 100% → dashOffset = 0 (fully visible/full)
  const pathLength = 251;
  const dashOffset = pathLength * (1 - percentage / 100);

  return (
    <div className="relative w-48 h-24 mb-2">
      <svg className="w-full h-full overflow-visible" viewBox="0 0 200 100">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#F0F4F8"
          strokeLinecap="round"
          strokeWidth="12"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#4A90E2"
          strokeDasharray={pathLength}
          strokeDashoffset={pathLength}
          strokeLinecap="round"
          strokeWidth="12"
          style={{
            strokeDashoffset: dashOffset,
            transition: 'stroke-dashoffset 1.5s ease-out',
          }}
        />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center translate-y-2">
        <span className="text-2xl font-bold text-primary">{percentage}%</span>
        <span className="text-xs text-[#718096]">Budget used</span>
      </div>
    </div>
  );
}
