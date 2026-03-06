"use client";

import React from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info',
  isLoading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const iconBgColor = type === 'danger' ? 'bg-red-50 text-red-500' : type === 'warning' ? 'bg-yellow-50 text-yellow-500' : 'bg-blue-50 text-blue-500';
  const iconSymbol = type === 'danger' ? 'delete' : type === 'warning' ? 'warning' : 'info';
  const confirmButtonColor = type === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : type === 'warning' ? 'bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/30' : 'bg-primary hover:bg-primary/90 shadow-primary/30';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
      <div 
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" 
        onClick={onClose}
      ></div>
      <div className="relative w-full max-w-[340px] bg-white rounded-[24px] p-6 shadow-2xl flex flex-col items-center text-center">
        <div className={`mb-5 flex items-center justify-center size-14 rounded-full ${iconBgColor}`}>
          <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>{iconSymbol}</span>
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed px-2 whitespace-pre-line">
          {message}
        </p>
        {cancelText ? (
          <div className="grid grid-cols-2 gap-4 w-full">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-colors disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`py-3.5 px-4 text-white rounded-2xl font-bold text-sm shadow-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${confirmButtonColor}`}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Processing...</span>
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        ) : (
          <div className="w-full">
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`w-full py-3.5 px-4 text-white rounded-2xl font-bold text-sm shadow-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${confirmButtonColor}`}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Processing...</span>
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

