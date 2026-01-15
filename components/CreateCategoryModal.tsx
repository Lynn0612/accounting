"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { useLedger } from "@/contexts/LedgerContext";
import { useCreateCategory } from "@/hooks/useCategories";
import ConfirmModal from "@/components/ConfirmModal";

const emojiIcons = [
  "🍚", "🛍️", "🏠",
  "🚗", "✈️", "🪙",
  "🎮", "💰", "💼", "🎁",
  "📈", "🤝", "🐾","🍰", 
  "🍸", "🎬", "💪",
  "🏥", "📖",
];

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (categoryId: string) => void;
  type?: 'expense' | 'income';
}

export default function CreateCategoryModal({
  isOpen,
  onClose,
  onSuccess,
  type = 'expense',
}: CreateCategoryModalProps) {
  const [categoryName, setCategoryName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const { activeLedger } = useLedger();
  const createCategory = useCreateCategory();

  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSave = async () => {
    if (!categoryName.trim() || !selectedEmoji) {
      return;
    }

    if (!activeLedger) {
      setErrorMessage("please select a book");
      setShowErrorModal(true);
      return;
    }

    try {
      const categoryData: any = {
        name: categoryName.trim(),
        icon: selectedEmoji,
        type: type === 'expense' ? 'Expense' : 'Income',
      };

      if (activeLedger.type === 'ledger') {
        categoryData.ledger_id = activeLedger.id;
      } else if (activeLedger.type === 'account_book') {
        categoryData.book_id = activeLedger.id;
      }

      const newCategory = await createCategory.mutateAsync(categoryData);

      // Reset form
      setCategoryName("");
      setSelectedEmoji(null);
      
      // Call callbacks - pass the new category ID and close modal immediately
      onSuccess(newCategory.id);
      onClose();
    } catch (error: any) {
      console.error("Error creating category:", error);
      setErrorMessage("create category failed: " + (error.message || "Unknown error"));
      setShowErrorModal(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-end justify-center pointer-events-none">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-auto transition-opacity opacity-100"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm mx-4 mb-24 bg-background-light rounded-[32px] shadow-2xl overflow-hidden pointer-events-auto transform transition-all translate-y-0 opacity-100 flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>
        <div className="px-6 pt-6 pb-2 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-[#121417]">
            Select Icon
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center size-8 rounded-full bg-white hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 shrink-0">
          <div className="flex items-center w-full bg-white rounded-2xl px-4 py-3 shadow-sm border border-transparent focus-within:border-primary/30 transition-all">
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Category Name"
              className="bg-transparent border-none outline-none text-base font-medium w-full text-[#121417] placeholder:text-gray-400 p-0 focus:ring-0"
            />
          </div>
        </div>

        <div className="px-6 pb-8 flex-1 overflow-y-auto no-scrollbar min-h-0">
          <div className="grid grid-cols-4 gap-4">
            {emojiIcons.map((emoji, index) => {
              const isSelected = selectedEmoji === emoji;
              return (
                <button
                  key={index}
                  onClick={() => setSelectedEmoji(emoji)}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div
                    className={`size-14 rounded-2xl flex items-center justify-center shadow-sm transition-all duration-200 border ${
                      isSelected
                        ? "bg-primary text-white border-primary shadow-soft shadow-blue-300/50"
                        : "bg-white text-[#657486] border-transparent group-hover:bg-blue-50 group-hover:text-primary group-hover:border-primary/20"
                    }`}
                  >
                    <span className="text-2xl">{emoji}</span>
                  </div>
                </button>
              );
            })}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (categoryName.trim() && selectedEmoji) {
                  handleSave();
                }
              }}
              disabled={!categoryName.trim() || !selectedEmoji}
              className={`flex flex-col items-center gap-2 group size-14 rounded-2xl flex items-center justify-center shadow-sm transition-all duration-200 border ${
                categoryName.trim() && selectedEmoji
                  ? "bg-primary text-white border-primary shadow-soft shadow-blue-300/50 cursor-pointer hover:bg-primary-dark"
                  : "bg-primary text-white border-primary opacity-50 cursor-not-allowed"
              }`}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onConfirm={() => setShowErrorModal(false)}
        title="錯誤"
        message={errorMessage}
        confirmText="確定"
        cancelText=""
        type="warning"
      />
    </div>
  );
}





