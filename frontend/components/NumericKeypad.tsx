"use client";

import { ArrowLeft } from "lucide-react";

interface NumericKeypadProps {
  onInput: (value: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  onCalculate: () => void;
  onSave?: () => void;
  canSave?: boolean;
}

export default function NumericKeypad({
  onInput,
  onClear,
  onBackspace,
  onCalculate,
  onSave,
  canSave = false,
}: NumericKeypadProps) {
  const handleClick = (value: string) => {
    onInput(value);
  };

  return (
    <div className="bg-white rounded-t-[32px] p-6 pb-8 shadow-[0_-12px_40px_rgba(0,0,0,0.08)] z-20 shrink-0">
      <div className="flex flex-col gap-4 max-w-[360px] mx-auto">
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={onClear}
            className="h-[60px] rounded-2xl flex items-center justify-center text-xl font-bold text-red-500 hover:bg-red-50 transition-colors active:scale-95"
          >
            C
          </button>
          <button
            onClick={() => handleClick("÷")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-primary hover:bg-blue-50 transition-colors active:scale-95"
          >
            ÷
          </button>
          <button
            onClick={() => handleClick("×")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-primary hover:bg-blue-50 transition-colors active:scale-95"
          >
            ×
          </button>
          <button
            onClick={onBackspace}
            className="h-[60px] rounded-2xl flex items-center justify-center text-xl font-medium text-primary hover:bg-blue-50 transition-colors active:scale-95"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>

          <button
            onClick={() => handleClick("7")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            7
          </button>
          <button
            onClick={() => handleClick("8")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            8
          </button>
          <button
            onClick={() => handleClick("9")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            9
          </button>
          <button
            onClick={() => handleClick("-")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-3xl font-medium text-primary hover:bg-blue-50 transition-colors active:scale-95 pb-1"
          >
            -
          </button>

          <button
            onClick={() => handleClick("4")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            4
          </button>
          <button
            onClick={() => handleClick("5")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            5
          </button>
          <button
            onClick={() => handleClick("6")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            6
          </button>
          <button
            onClick={() => handleClick("+")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-3xl font-medium text-primary hover:bg-blue-50 transition-colors active:scale-95 pb-1"
          >
            +
          </button>

          <button
            onClick={() => handleClick("1")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            1
          </button>
          <button
            onClick={() => handleClick("2")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            2
          </button>
          <button
            onClick={() => handleClick("3")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            3
          </button>
          <button
            onClick={onCalculate}
            className="h-[60px] rounded-2xl flex items-center justify-center text-3xl font-medium text-primary bg-white hover:bg-blue-50 transition-colors active:scale-95 pb-1"
          >
            =
          </button>

          <button
            onClick={() => handleClick("0")}
            className="col-span-2 h-[60px] rounded-2xl flex items-center justify-center text-2xl font-semibold text-[#121417] hover:bg-background-light transition-colors active:scale-95"
          >
            0
          </button>
          <button
            onClick={() => handleClick(".")}
            className="h-[60px] rounded-2xl flex items-center justify-center text-2xl font-bold text-[#121417] hover:bg-background-light transition-colors active:scale-95 pb-3"
          >
            .
          </button>
          <button
            onClick={onSave || onCalculate}
            disabled={!canSave && onSave !== undefined}
            className={`h-[60px] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 transition-all active:scale-90 duration-150 ${
              canSave || onSave === undefined
                ? "bg-primary hover:bg-primary-dark"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            <svg
              className="w-7 h-7"
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
  );
}

