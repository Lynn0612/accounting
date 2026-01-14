"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";

interface DateRangePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (startDate: Date, endDate: Date) => void;
  initialStartDate?: Date;
  initialEndDate?: Date;
}

export default function DateRangePickerModal({
  isOpen,
  onClose,
  onConfirm,
  initialStartDate,
  initialEndDate,
}: DateRangePickerModalProps) {
  const [startDate, setStartDate] = useState<Date>(
    initialStartDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [endDate, setEndDate] = useState<Date>(
    initialEndDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  );
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selecting, setSelecting] = useState<"start" | "end">("start");

  useEffect(() => {
    if (initialStartDate) setStartDate(initialStartDate);
    if (initialEndDate) setEndDate(initialEndDate);
    if (initialStartDate) setCurrentMonth(new Date(initialStartDate));
  }, [initialStartDate, initialEndDate]);

  const generateDaysInMonth = useCallback((year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  }, []);

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDayClick = (day: number, monthOffset: number = 0) => {
    const clickedDate = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + monthOffset,
      day
    );

    if (selecting === "start") {
      if (clickedDate > endDate) {
        setStartDate(clickedDate);
        setEndDate(clickedDate);
        setSelecting("end");
      } else {
        setStartDate(clickedDate);
        setSelecting("end");
      }
    } else {
      if (clickedDate < startDate) {
        setStartDate(clickedDate);
        setEndDate(clickedDate);
        setSelecting("start");
      } else {
        setEndDate(clickedDate);
        setSelecting("start");
      }
    }
  };

  const handleConfirm = () => {
    onConfirm(startDate, endDate);
    onClose();
  };

  const isDateInRange = (day: number, monthOffset: number = 0) => {
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + monthOffset,
      day
    );
    return date > startDate && date < endDate;
  };

  const isStartDate = (day: number, monthOffset: number = 0) => {
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + monthOffset,
      day
    );
    return date.toDateString() === startDate.toDateString();
  };

  const isEndDate = (day: number, monthOffset: number = 0) => {
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + monthOffset,
      day
    );
    return date.toDateString() === endDate.toDateString();
  };

  if (!isOpen) return null;

  const days = generateDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const nextMonthDays = generateDaysInMonth(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1
  );

  const getDayClasses = (day: number, monthOffset: number = 0, dayIndex: number, totalDays: (number | null)[]) => {
    const inRange = isDateInRange(day, monthOffset);
    const isStart = isStartDate(day, monthOffset);
    const isEnd = isEndDate(day, monthOffset);
    const isInRangeButNotEdge = inRange && !isStart && !isEnd;

    if (isStart) {
      return {
        container: "h-9 relative flex items-center justify-center",
        background: "absolute inset-y-0 right-0 left-1/2 bg-primary-pale/50 rounded-l-full",
        button: "relative w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold shadow-md z-10",
      };
    }
    if (isEnd) {
      return {
        container: "h-9 relative flex items-center justify-center",
        background: "absolute inset-y-0 left-0 right-1/2 bg-primary-pale/50 rounded-r-full",
        button: "relative w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold shadow-md z-10",
      };
    }
    if (isInRangeButNotEdge) {
      const dayOfWeek = dayIndex % 7;
      const isFirstInWeek = dayOfWeek === 0;
      const isLastInWeek = dayOfWeek === 6;
      const prevDay = dayIndex > 0 ? totalDays[dayIndex - 1] : null;
      const nextDay = dayIndex < totalDays.length - 1 ? totalDays[dayIndex + 1] : null;
      const prevInRange = prevDay !== null && isDateInRange(prevDay, monthOffset);
      const nextInRange = nextDay !== null && isDateInRange(nextDay, monthOffset);
      
      let roundedClasses = "";
      if (isFirstInWeek || !prevInRange) roundedClasses += "rounded-l-lg ";
      if (isLastInWeek || !nextInRange) roundedClasses += "rounded-r-lg";
      
      return {
        container: `h-9 relative flex items-center justify-center bg-primary-pale/50 ${roundedClasses.trim()}`,
        background: null,
        button: "relative z-10 font-medium text-primary w-full h-full flex items-center justify-center",
      };
    }
    return {
      container: "h-9 relative flex items-center justify-center",
      background: null,
      button: "relative z-10 font-medium text-text-main hover:bg-gray-50 rounded-full w-8 h-8 flex items-center justify-center",
    };
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative bg-white w-full max-w-[340px] rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        <div className="p-6 pb-4 border-b border-gray-100 bg-white z-10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-text-main">Select Period</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-text-secondary transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`flex-1 bg-background-light rounded-2xl p-3 border-2 ${
                selecting === "start" ? "border-primary/20" : "border-transparent"
              } relative`}
              onClick={() => setSelecting("start")}
            >
              <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                Start
              </span>
              <div className="font-bold text-text-main text-lg">
                {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
              {selecting === "start" && (
                <div className="absolute top-1/2 -right-1.5 w-3 h-3 bg-white border-l border-b border-primary/20 transform -translate-y-1/2 rotate-45"></div>
              )}
            </div>
            <span className="material-symbols-outlined text-text-secondary">arrow_right_alt</span>
            <div
              className={`flex-1 bg-white rounded-2xl p-3 border ${
                selecting === "end" ? "border-primary/50" : "border-gray-200"
              } hover:border-primary/50 transition-colors`}
              onClick={() => setSelecting("end")}
            >
              <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                End
              </span>
              <div className="font-bold text-text-main text-lg">
                {endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 pt-2 hide-scrollbar">
          {/* Current Month */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-gray-100 rounded-full text-text-secondary"
              >
                <span className="material-symbols-outlined text-xl">chevron_left</span>
              </button>
              <span className="font-bold text-text-main">
                {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <div className="w-8"></div>
            </div>
            <div className="grid grid-cols-7 mb-2 text-center">
              {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                <span key={day} className="text-xs font-semibold text-text-secondary/50">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
              {days.map((day, index) => {
                if (!day) return <div key={index} className="h-9"></div>;

                const classes = getDayClasses(day, 0, index, days);

                return (
                  <div key={index} className={classes.container}>
                    {classes.background && <div className={classes.background}></div>}
                    <button
                      onClick={() => handleDayClick(day)}
                      className={classes.button}
                    >
                      {day}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next Month */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-8"></div>
              <span className="font-bold text-text-main">
                {new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-gray-100 rounded-full text-text-secondary"
              >
                <span className="material-symbols-outlined text-xl">chevron_right</span>
              </button>
            </div>
            <div className="grid grid-cols-7 mb-2 text-center">
              {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                <span key={day} className="text-xs font-semibold text-text-secondary/50">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
              {nextMonthDays.map((day, index) => {
                if (!day) return <div key={index} className="h-9"></div>;

                const classes = getDayClasses(day, 1, index, nextMonthDays);

                return (
                  <div key={index} className={classes.container}>
                    {classes.background && <div className={classes.background}></div>}
                    <button
                      onClick={() => {
                        handleDayClick(day, 1);
                        const isStart = isStartDate(day, 1);
                        const isEnd = isEndDate(day, 1);
                        if (isStart || isEnd) {
                          setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
                        }
                      }}
                      className={classes.button}
                    >
                      {day}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6 pt-4 bg-white border-t border-gray-100 z-10">
          <button
            onClick={handleConfirm}
            className="w-full bg-primary text-white font-bold text-lg h-14 rounded-2xl shadow-lg shadow-primary/30 hover:bg-primary-light active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
