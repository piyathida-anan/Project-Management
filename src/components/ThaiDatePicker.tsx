import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatIsoToThaiDate } from '../utils/formatters';

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function toIso(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function parseIsoParts(iso?: string): { year: number; month: number } {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m] = iso.split('-').map(Number);
    return { year: y, month: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

interface CalendarGridProps {
  selectedStart: string;
  selectedEnd?: string;
  mode: 'single' | 'range';
  onPickDay: (iso: string) => void;
}

const CalendarGrid: React.FC<CalendarGridProps> = ({
  selectedStart,
  selectedEnd,
  mode,
  onPickDay,
}) => {
  const initial = parseIsoParts(selectedStart);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  const daysMatrix = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      cells.push(d);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const yearOptions = useMemo(() => {
    const base = new Date().getFullYear();
    const list: number[] = [];
    for (let y = base - 5; y <= base + 10; y++) {
      list.push(y);
    }
    return list;
  }, []);

  return (
    <div>
      {/* Month / Year Navigation */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={handlePrevMonth}
          aria-label="เดือนก่อนหน้า"
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5">
          <select
            value={viewMonth}
            onChange={(e) => setViewMonth(Number(e.target.value))}
            aria-label="เลือกเดือน"
            className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium text-slate-800"
          >
            {THAI_MONTHS.map((mName, idx) => (
              <option key={mName} value={idx}>
                {mName}
              </option>
            ))}
          </select>

          <select
            value={viewYear}
            onChange={(e) => setViewYear(Number(e.target.value))}
            aria-label="เลือกปี พ.ศ."
            className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium text-slate-800 tabular-nums"
          >
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                พ.ศ. {yr + 543}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          aria-label="เดือนถัดไป"
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="h-7 flex items-center justify-center text-[11px] font-semibold text-slate-500"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-1">
        {daysMatrix.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-9" />;
          }
          const iso = toIso(viewYear, viewMonth, day);
          const isStart = selectedStart === iso;
          const isEnd = mode === 'range' && selectedEnd === iso;
          const isInRange =
            mode === 'range' &&
            Boolean(selectedStart && selectedEnd) &&
            iso > selectedStart &&
            iso < (selectedEnd ?? '');

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPickDay(iso)}
              className={`h-9 rounded-lg text-xs font-medium tabular-nums transition-colors ${
                isStart || isEnd
                  ? 'bg-blue-900 text-white font-semibold'
                  : isInRange
                    ? 'bg-blue-100 text-blue-900'
                    : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface SingleDatePopupInputProps {
  id?: string;
  label?: string;
  value: string;
  placeholder?: string;
  onChange: (isoDate: string) => void;
}

export const ThaiDatePopupInput: React.FC<SingleDatePopupInputProps> = ({
  id,
  label,
  value,
  placeholder = 'เลือกวันที่จากปฏิทิน',
  onChange,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-left flex items-center justify-between gap-2 hover:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
      >
        <span className={value ? 'text-slate-900 tabular-nums' : 'text-slate-400'}>
          {value ? formatIsoToThaiDate(value) : placeholder}
        </span>
        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label || 'เลือกวันที่'}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
              <h4 className="text-sm font-semibold text-slate-900">
                {label || 'เลือกวันที่'}
              </h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <CalendarGrid
              mode="single"
              selectedStart={value}
              onPickDay={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />

            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                ล้างวันที่
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface DateRangePopupInputProps {
  label?: string;
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
}

export const ThaiDateRangePopupInput: React.FC<DateRangePopupInputProps> = ({
  label,
  startDate,
  endDate,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [step, setStep] = useState<'start' | 'end'>('start');

  const handleOpen = () => {
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setStep('start');
    setOpen(true);
  };

  const handlePickDay = (iso: string) => {
    if (step === 'start') {
      setDraftStart(iso);
      if (draftEnd && iso > draftEnd) {
        setDraftEnd('');
      }
      setStep('end');
    } else {
      if (draftStart && iso < draftStart) {
        setDraftEnd(draftStart);
        setDraftStart(iso);
      } else {
        setDraftEnd(iso);
      }
      setStep('start');
    }
  };

  const displayText =
    startDate && endDate
      ? `${formatIsoToThaiDate(startDate)} - ${formatIsoToThaiDate(endDate)}`
      : startDate
        ? `เริ่ม ${formatIsoToThaiDate(startDate)} (ยังไม่เลือกวันสิ้นสุด)`
        : 'คลิกเพื่อเลือกเวลาต้นทาง - เวลาปลายทาง';

  return (
    <div>
      {label && (
        <span className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-left flex items-center justify-between gap-2 hover:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
      >
        <span
          className={
            startDate && endDate
              ? 'text-slate-900 tabular-nums truncate'
              : 'text-slate-400 truncate'
          }
        >
          {displayText}
        </span>
        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="เลือกระยะเวลาดำเนินงาน"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  เลือกระยะเวลาดำเนินงาน
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {step === 'start'
                    ? 'ขั้นตอนที่ 1: คลิกเลือกวันที่เริ่มต้น (ต้นทาง)'
                    : 'ขั้นตอนที่ 2: คลิกเลือกวันที่สิ้นสุด (ปลายทาง)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              <button
                type="button"
                onClick={() => setStep('start')}
                className={`p-2 rounded-lg border text-left ${
                  step === 'start'
                    ? 'border-blue-900 bg-blue-50/60'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span className="block text-[11px] text-slate-500">เวลาต้นทาง</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {draftStart ? formatIsoToThaiDate(draftStart) : 'ยังไม่เลือก'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStep('end')}
                className={`p-2 rounded-lg border text-left ${
                  step === 'end'
                    ? 'border-blue-900 bg-blue-50/60'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span className="block text-[11px] text-slate-500">เวลาปลายทาง</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {draftEnd ? formatIsoToThaiDate(draftEnd) : 'ยังไม่เลือก'}
                </span>
              </button>
            </div>

            <CalendarGrid
              mode="range"
              selectedStart={draftStart}
              selectedEnd={draftEnd}
              onPickDay={handlePickDay}
            />

            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={!draftStart || !draftEnd}
                onClick={() => {
                  onChange({ startDate: draftStart, endDate: draftEnd });
                  setOpen(false);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-40"
              >
                ยืนยันช่วงเวลา
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
