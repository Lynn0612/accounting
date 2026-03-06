"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ErrorToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  details?: string;
}

export default function ErrorToast({
  message,
  isVisible,
  onClose,
  details,
}: ErrorToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-3rem)] animate-in fade-in slide-in-from-top-2">
      <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-4 shadow-lg flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <span className="material-symbols-outlined text-red-500" style={{ fontSize: "24px" }}>
            error
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-900 mb-1">{message}</p>
          {details && (
            <p className="text-xs text-red-700 opacity-75">{details}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

