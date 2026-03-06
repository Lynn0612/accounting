"use client";

import { useState, useEffect, useRef } from "react";
import { useLedger } from "@/contexts/LedgerContext";
import { useCategories, useDeleteCategory } from "@/hooks/useCategories";
import CreateCategoryModal from "@/components/CreateCategoryModal";
import ConfirmModal from "@/components/ConfirmModal";
import { createClient } from "@/lib/supabase/client";

interface CategoryPickerProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string) => void;
  onModalStateChange: (isOpen: boolean) => void;
  type: 'expense' | 'income';
}


export default function CategoryPicker({
  selectedCategory,
  onSelectCategory,
  onModalStateChange,
  type,
}: CategoryPickerProps) {
  const { activeLedger } = useLedger();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isCheckingUsage, setIsCheckingUsage] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const supabase = createClient();
  const deleteCategory = useDeleteCategory();
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const ledgerId = activeLedger?.type === 'ledger' ? activeLedger.id : null;
  const bookId = activeLedger?.type === 'account_book' ? activeLedger.id : null;
  const { data: categories = [], refetch } = useCategories(ledgerId, type, bookId);

  useEffect(() => {
    onModalStateChange(showCreateModal || showDeleteModal);
  }, [showCreateModal, showDeleteModal, onModalStateChange]);

  const handleCreateSuccess = (categoryId: string) => {
    onSelectCategory(categoryId);
    setShowCreateModal(false);
  };

  const handleCategoryClick = (cat: any, e: React.MouseEvent) => {
    e.stopPropagation();

    // Database category - handle single/double click
    if (clickTimerRef.current) {
      // Double click detected
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      handleDeleteClick(cat);
    } else {
      // Single click - set timer
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        onSelectCategory(cat.id);
      }, 300);
    }
  };

  const handleDeleteClick = async (cat: any) => {
    setCategoryToDelete({ id: cat.id, name: cat.name });
    setShowDeleteModal(true);
  };

  const checkCategoryUsage = async (categoryId: string): Promise<boolean> => {
    // Check transactions table
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id')
      .eq('category_id', categoryId)
      .limit(1);

    if (txError) {
      console.error('Error checking category usage in transactions:', txError);
      return false;
    }

    return (transactions?.length || 0) > 0;
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete || !activeLedger) return;

    setIsCheckingUsage(true);
    try {
      // Check if category is "To receive from" - cannot delete this special category
      if (categoryToDelete.name === 'To receive from') {
        setShowDeleteModal(false);
        setCategoryToDelete(null);
        setIsCheckingUsage(false);
        setErrorMessage('this category is a special category, cannot be deleted');
        setShowErrorModal(true);
        return;
      }

      const isUsed = await checkCategoryUsage(categoryToDelete.id);
      
      if (isUsed) {
        setShowDeleteModal(false);
        setCategoryToDelete(null);
        setIsCheckingUsage(false);
        setErrorMessage('this category is used, cannot be deleted');
        setShowErrorModal(true);
        return;
      }

      await deleteCategory.mutateAsync({
        categoryId: categoryToDelete.id,
        ledgerId: ledgerId || null,
        bookId: bookId || null,
      });

      setShowDeleteModal(false);
      setCategoryToDelete(null);
      refetch();
      
      if (selectedCategory === categoryToDelete.id) {
        onSelectCategory('');
      }
    } catch (error: any) {
      console.error('Error deleting category:', error);
      setErrorMessage('delete category failed: ' + (error.message || 'Unknown error'));
      setShowErrorModal(true);
    } finally {
      setIsCheckingUsage(false);
    }
  };

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <div className="px-6 w-full mb-6">
        <div className="flex overflow-x-auto gap-4 pb-2 -mx-1 px-1 snap-x snap-mandatory no-scrollbar">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={(e) => handleCategoryClick(cat, e)}
                className="flex flex-col items-center gap-2 shrink-0 group snap-start opacity-70 hover:opacity-100 transition-opacity"
              >
                <div className={`size-10 rounded-full bg-white flex items-center justify-center text-[#657486] shadow-sm transition-transform transform group-active:scale-95 border-2 ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-transparent hover:border-primary/20"
                }`}>
                  <span style={{ fontSize: "20px" }}>{cat.icon || '📁'}</span>
                </div>
                <span className={`text-xs font-medium ${
                  isSelected ? "text-primary font-bold" : "text-[#657486]"
                }`}>
                  {cat.name}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex flex-col items-center gap-2 shrink-0 group snap-start opacity-70 hover:opacity-100 transition-opacity"
          >
            <div className="size-10 rounded-full bg-white flex items-center justify-center text-[#657486] shadow-sm transition-transform transform group-active:scale-95 border-2 border-transparent hover:border-primary/20">
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>add</span>
            </div>
            <span className="text-xs font-medium text-[#657486]">Add</span>
          </button>
        </div>
      </div>

      <CreateCategoryModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
        type={type}
      />

      {showDeleteModal && categoryToDelete && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => {
            setShowDeleteModal(false);
            setCategoryToDelete(null);
          }}></div>
          <div className="relative w-full max-w-[340px] bg-white rounded-[24px] p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="mb-5 flex items-center justify-center size-14 rounded-full bg-red-50 text-red-500">
              <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>delete</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">delete category</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed px-2">
            Are you sure you want to delete "{categoryToDelete.name}" ？
            </p>
            <div className="grid grid-cols-2 gap-4 w-full">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setCategoryToDelete(null);
                }}
                disabled={isCheckingUsage}
                className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-colors disabled:opacity-50"
              >
                cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isCheckingUsage}
                className="py-3.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCheckingUsage ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>checking...</span>
                  </>
                ) : (
                  'delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onConfirm={() => setShowErrorModal(false)}
        title="warning"
        message={errorMessage}
        confirmText="confirm"
        cancelText=""
        type="warning"
      />
    </>
  );
}

