"use client";

import { useState, useRef, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, isWithinInterval, isBefore, isAfter, startOfWeek, endOfWeek } from "date-fns";

type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
};

export default function DateRangePicker({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = from ? new Date(from + "T12:00:00") : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selecting, setSelecting] = useState<"start" | "end">("start");
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [tempFrom, setTempFrom] = useState(from);
  const [tempTo, setTempTo] = useState(to);
  const ref = useRef<HTMLDivElement>(null);

  const rightMonth = addMonths(leftMonth, 1);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDayClick = (day: Date) => {
    const ds = format(day, "yyyy-MM-dd");
    if (selecting === "start") {
      setTempFrom(ds);
      setTempTo(ds);
      setSelecting("end");
    } else {
      if (isBefore(day, new Date(tempFrom + "T12:00:00"))) {
        setTempFrom(ds);
        setTempTo(tempFrom);
      } else {
        setTempTo(ds);
      }
      setSelecting("start");
    }
  };

  const applyFilter = () => {
    onChange(tempFrom, tempTo);
    setOpen(false);
  };

  const presets = [
    { label: "This Month", fn: () => { const now = new Date(); setTempFrom(format(startOfMonth(now), "yyyy-MM-dd")); setTempTo(format(now, "yyyy-MM-dd")); } },
    { label: "Last 7 Days", fn: () => { const now = new Date(); const d = new Date(now); d.setDate(d.getDate() - 7); setTempFrom(format(d, "yyyy-MM-dd")); setTempTo(format(now, "yyyy-MM-dd")); } },
    { label: "Last 30 Days", fn: () => { const now = new Date(); const d = new Date(now); d.setDate(d.getDate() - 30); setTempFrom(format(d, "yyyy-MM-dd")); setTempTo(format(now, "yyyy-MM-dd")); } },
    { label: "Last Month", fn: () => { const now = new Date(); const prev = subMonths(now, 1); setTempFrom(format(startOfMonth(prev), "yyyy-MM-dd")); setTempTo(format(endOfMonth(prev), "yyyy-MM-dd")); } },
  ];

  const renderMonth = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calStart, end: calEnd });

    const fromDate = tempFrom ? new Date(tempFrom + "T12:00:00") : null;
    const toDate = tempTo ? new Date(tempTo + "T12:00:00") : null;

    return (
      <div className="w-[280px]">
        <div className="flex items-center justify-between mb-3 px-1">
          <button onClick={() => setLeftMonth(subMonths(leftMonth, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-500">&larr;</button>
          <span className="text-[13px] font-semibold text-gray-800">{format(monthDate, "MMMM yyyy")}</span>
          <button onClick={() => setLeftMonth(addMonths(leftMonth, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-500">&rarr;</button>
        </div>
        <div className="grid grid-cols-7 gap-0">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
            <div key={d} className="text-center text-[10px] text-gray-400 font-medium py-1">{d}</div>
          ))}
          {days.map((day, i) => {
            const isCurrentMonth = day.getMonth() === monthDate.getMonth();
            const isStart = fromDate && isSameDay(day, fromDate);
            const isEnd = toDate && isSameDay(day, toDate);
            const isInRange = fromDate && toDate && isWithinInterval(day, { start: fromDate, end: toDate });
            const isHoverRange = fromDate && hoverDate && selecting === "end" && !toDate && isWithinInterval(day, {
              start: isBefore(hoverDate, fromDate) ? hoverDate : fromDate,
              end: isAfter(hoverDate, fromDate) ? hoverDate : fromDate,
            });

            return (
              <button
                key={i}
                onClick={() => isCurrentMonth && handleDayClick(day)}
                onMouseEnter={() => setHoverDate(day)}
                className={`text-[12px] py-1.5 transition-all ${
                  !isCurrentMonth ? "text-gray-200 cursor-default" :
                  isStart || isEnd ? "bg-gushwork-500 text-white font-semibold rounded-md" :
                  isInRange ? "bg-gushwork-50 text-gushwork-700" :
                  isHoverRange ? "bg-gushwork-50/50 text-gushwork-500" :
                  "text-gray-700 hover:bg-gray-100 rounded-md"
                }`}>
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const displayText = from && to
    ? `${format(new Date(from + "T12:00:00"), "MMM d, yyyy")} — ${format(new Date(to + "T12:00:00"), "MMM d, yyyy")}`
    : "Select dates";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); setTempFrom(from); setTempTo(to); setSelecting("start"); }}
        className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm hover:border-gray-300 transition-all">
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-[12px] text-gray-700 font-medium">{displayText}</span>
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-5">
          {/* Presets */}
          <div className="flex items-center gap-2 mb-4">
            {presets.map(p => (
              <button key={p.label} onClick={p.fn}
                className="text-[10px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gushwork-50 hover:text-gushwork-600 transition-all font-medium">
                {p.label}
              </button>
            ))}
          </div>

          {/* Date display */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`flex-1 border rounded-lg px-3 py-2 text-[12px] ${selecting === "start" ? "border-gushwork-400 bg-gushwork-50/30" : "border-gray-200"}`}>
              <span className="text-gray-700">{tempFrom ? format(new Date(tempFrom + "T12:00:00"), "MMMM d, yyyy") : "Start date"}</span>
            </div>
            <span className="text-gray-300 text-[11px]">and</span>
            <div className={`flex-1 border rounded-lg px-3 py-2 text-[12px] ${selecting === "end" ? "border-gushwork-400 bg-gushwork-50/30" : "border-gray-200"}`}>
              <span className="text-gray-700">{tempTo ? format(new Date(tempTo + "T12:00:00"), "MMMM d, yyyy") : "End date"}</span>
            </div>
          </div>

          {/* Dual calendar */}
          <div className="flex gap-6">
            {renderMonth(leftMonth)}
            {renderMonth(rightMonth)}
          </div>

          {/* Apply */}
          <div className="flex justify-end mt-4 pt-3 border-t border-gray-100">
            <button onClick={() => setOpen(false)} className="text-[11px] text-gray-400 hover:text-gray-600 px-3 py-1.5 mr-2">Cancel</button>
            <button onClick={applyFilter}
              className="text-[11px] bg-gushwork-500 hover:bg-gushwork-600 text-white px-4 py-1.5 rounded-lg font-medium transition-all">
              Apply Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
