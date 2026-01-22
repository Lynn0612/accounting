"use client";

import React from "react";
import { Star, Check } from "lucide-react";

interface Participant {
  id: string;
  name: string;
  avatar?: string;
  isPayer?: boolean;
  role?: 'Owner' | 'Member' | 'Viewer';
}

interface SelectParticipantsProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => void;
  participants: Participant[];
  selectedIds: string[];
  payerId?: string | null;
  allowEmpty?: boolean; // Allow confirming with no selection
  single?: boolean;
  disableViewers?: boolean; // Disable Viewer selection (for shared with UI)
}

export default function SelectParticipants({
  isOpen,
  onClose,
  onConfirm,
  participants,
  selectedIds,
  payerId,
  allowEmpty = false,
  single = false,
  disableViewers = false, // Default: allow Viewer selection
}: SelectParticipantsProps) {
  const [localSelected, setLocalSelected] = React.useState<string[]>(selectedIds);

  React.useEffect(() => {
    if (isOpen) {
      // Always use the provided selectedIds, don't auto-select payer
      setLocalSelected(selectedIds);
    }
  }, [isOpen, selectedIds]);

  const handleToggle = (id: string) => {
    setLocalSelected((prev) => {
      if (single) {
        const isSelected = prev.includes(id);
        if (isSelected) {
          return allowEmpty ? [] : prev;
        }
        return [id];
      }
      return prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
    });
  };

  const handleConfirm = () => {
    if (!allowEmpty && localSelected.length === 0) {
      return;
    }
    onConfirm(localSelected);
    onClose();
  };

  const canConfirm = allowEmpty || localSelected.length > 0;

  if (!isOpen) return null;

  const payer = participants.find((p) => p.id === payerId);

  return (
    <div className="absolute inset-0 z-[100] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full bg-white rounded-t-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85%] animate-in slide-in-from-bottom duration-300">
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full"></div>
        </div>

        <div className="px-6 py-4 text-center border-b border-gray-50">
          <h2 className="text-xl font-bold text-[#121417]">
            Select Participants
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Who are you splitting this with?
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
          {payer && payerId && (
            <div>
              <h3 className="px-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Payer
              </h3>
              <label className="group flex items-center p-3 bg-blue-50/50 rounded-2xl border-2 border-primary/20 cursor-pointer transition-all hover:bg-blue-50">
                <div className="relative shrink-0">
                  {payer.avatar ? (
                    <img
                      alt="Payer"
                      className="size-12 rounded-full object-cover border-2 border-white shadow-sm"
                      src={payer.avatar}
                    />
                  ) : payer.id === "__DEPOSIT__" ? (
                    <div className="size-12 rounded-full bg-primary flex items-center justify-center text-white font-bold border-2 border-white shadow-sm">
                      <span className="material-symbols-outlined">account_balance_wallet</span>
                    </div>
                  ) : (
                    <div className="size-12 rounded-full bg-primary flex items-center justify-center text-white font-bold border-2 border-white shadow-sm">
                      {payer.name[0]}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-primary text-white rounded-full p-0.5 border-2 border-white">
                    <Star className="w-3 h-3 fill-white" />
                  </div>
                </div>
                <div className="ml-4 flex-1">
                  <div className="font-bold text-gray-900 group-hover:text-primary transition-colors">
                    {payer.name}
                  </div>
                  <div className="text-xs text-primary font-medium">Payer</div>
                </div>
                <div className="relative flex items-center justify-center size-7 shrink-0">
                  <input
                    checked={payerId ? localSelected.includes(payerId) : false}
                    onChange={() => payerId && handleToggle(payerId)}
                    className="peer appearance-none size-6 border-2 border-gray-300 rounded-full checked:bg-primary checked:border-primary transition-all bg-white"
                    type="checkbox"
                  />
                  <Check className="absolute text-white opacity-0 peer-checked:opacity-100 w-3 h-3 pointer-events-none" />
                </div>
              </label>
            </div>
          )}

          <div>
            <h3 className="px-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Members
            </h3>
            <div className="space-y-3">
              {participants
                .filter((p) => p.id !== payerId && (p.id !== '__DEPOSIT__' || single))
                .map((participant) => {
                  const isSelected = localSelected.includes(participant.id);
                  const isViewer = participant.role === 'Viewer';
                  const isDisabled = disableViewers && isViewer; // Only disable if disableViewers is true
                  return (
                    <label
                      key={participant.id}
                      className={`group flex items-center p-3 rounded-2xl border transition-all ${
                        isDisabled
                          ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
                          : 'bg-white border-gray-100 cursor-pointer hover:border-primary/30 hover:shadow-soft'
                      }`}
                    >
                      <div className="shrink-0">
                        {participant.avatar ? (
                          <img
                            alt={participant.name}
                            className={`size-12 rounded-full object-cover border ${
                              isDisabled ? 'border-gray-200 grayscale' : 'border-gray-100'
                            }`}
                            src={participant.avatar}
                          />
                        ) : participant.name === "Coco" ? (
                          <div className={`size-12 rounded-full flex items-center justify-center font-bold text-lg border ${
                            isDisabled
                              ? 'bg-gray-100 text-gray-400 border-gray-200'
                              : 'bg-yellow-50 text-yellow-500 border-yellow-100'
                          }`}>
                            C
                          </div>
                        ) : participant.id === "__DEPOSIT__" ? (
                          <div className={`size-12 rounded-full flex items-center justify-center font-bold text-lg border ${
                            isDisabled
                              ? 'bg-gray-100 text-gray-400 border-gray-200'
                              : 'bg-blue-50 text-primary border-blue-100'
                          }`}>
                            <span className="material-symbols-outlined">account_balance_wallet</span>
                          </div>
                        ) : (
                          <div className={`size-12 rounded-full flex items-center justify-center font-bold border ${
                            isDisabled
                              ? 'bg-gray-100 text-gray-400 border-gray-200'
                              : 'bg-gray-200 text-gray-600 border-gray-100'
                          }`}>
                            {participant.name[0]}
                          </div>
                        )}
                      </div>
                      <div className="ml-4 flex-1">
                        <div className={`font-bold transition-colors ${
                          isDisabled
                            ? 'text-gray-400'
                            : 'text-gray-900 group-hover:text-primary'
                        }`}>
                          {participant.name}
                        </div>
                        {isViewer && (
                          <div className="text-xs text-gray-400 mt-0.5">Viewer</div>
                        )}
                      </div>
                      <div className="relative flex items-center justify-center size-7 shrink-0">
                        <input
                          checked={isSelected}
                          onChange={() => !isDisabled && handleToggle(participant.id)}
                          disabled={isDisabled}
                          className={`peer appearance-none size-6 border-2 rounded-full transition-all ${
                            isDisabled
                              ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
                              : isSelected
                              ? 'border-primary bg-primary'
                              : 'border-gray-300 bg-white'
                          }`}
                          type="checkbox"
                        />
                        <span className="material-symbols-outlined absolute text-white opacity-0 peer-checked:opacity-100 text-sm pointer-events-none font-bold">
                          check
                        </span>
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>
          <div className="h-4"></div>
        </div>

        <div className="p-6 bg-white border-t border-gray-50 z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`flex-1 py-3.5 rounded-2xl font-bold text-white shadow-lg shadow-blue-200 transition-all active:scale-[0.98] ${
                canConfirm
                  ? "bg-primary hover:bg-primary-dark"
                  : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

