"use client";

import { useState, useRef, useEffect } from "react";
import { useLedger } from "@/contexts/LedgerContext";

interface LedgerDropdownProps {
  className?: string;
  onSelect?: (ledger: typeof ledgers[0]) => void;
}

export default function LedgerDropdown({ className = "", onSelect }: LedgerDropdownProps) {
  const { ledgers, activeLedger, setActiveLedger } = useLedger();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectLedger = (ledger: typeof ledgers[0]) => {
    if (onSelect) {
      onSelect(ledger);
    } else {
    setActiveLedger(ledger);
    }
    setIsOpen(false);
  };

  if (ledgers.length === 0) {
    return (
      <button className={`group flex items-center gap-2 bg-white py-2 px-5 rounded-pill shadow-sm hover:shadow-md transition-all duration-300 ${className}`}>
        <span className="text-sm font-bold text-text-main tracking-tight">No Ledgers</span>
      </button>
    );
  }

  return (
    <div className={`relative z-[9999] ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-2 bg-white py-2 px-5 rounded-pill shadow-sm hover:shadow-md transition-all duration-300 w-full"
      >
        <span className="text-sm font-bold text-text-main tracking-tight truncate">
          {activeLedger?.name || "Select Ledger"}
        </span>
        <span
          className={`material-symbols-outlined text-primary transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          style={{ fontSize: "20px" }}
        >
          keyboard_arrow_down
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-card shadow-lg border border-gray-100 z-[9999] max-h-64 overflow-y-auto">
          {ledgers.map((ledger) => (
            <button
              key={ledger.id}
              onClick={() => handleSelectLedger(ledger)}
              className="w-full px-4 py-3 bg-white hover:bg-gray-100 transition-colors text-center"
            >
              <span className="text-sm font-bold text-text-main">{ledger.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

