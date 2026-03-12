'use client';

import { useRef, useState } from 'react';

const formatDateFieldValue = (value: string) => {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${year.slice(-2)}.${month}.${day}`;
};

const parseManualDateValue = (value: string) => {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length !== 6 && digits.length !== 8) return null;

  const normalized = digits.length === 6 ? `20${digits}` : digits;
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const day = Number(normalized.slice(6, 8));

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
};

type InlineDateFieldProps = {
  id: string;
  value: string;
  emptyLabel: string;
  onChange: (nextValue: string | null) => void;
  className?: string;
};

export default function InlineDateField({
  id,
  value,
  emptyLabel,
  onChange,
  className = 'w-full',
}: InlineDateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [manualValue, setManualValue] = useState(value);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };

    input.focus({ preventScroll: true });

    if (pickerInput.showPicker) {
      try {
        pickerInput.showPicker();
        return;
      } catch {
        // Fallback for browsers that block showPicker.
      }
    }

    input.click();
  };

  const clearClickTimer = () => {
    if (!clickTimerRef.current) return;
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  };

  const handleSingleClick = () => {
    clearClickTimer();
    clickTimerRef.current = setTimeout(() => {
      openPicker();
      clickTimerRef.current = null;
    }, 180);
  };

  const handleDoubleClick = () => {
    clearClickTimer();
    setManualValue(value);
    setIsEditing(true);
  };

  const submitManualValue = () => {
    const nextValue = manualValue.trim();

    if (!nextValue) {
      onChange(null);
      setIsEditing(false);
      return;
    }

    const parsed = parseManualDateValue(nextValue);
    if (parsed) {
      onChange(parsed);
      setIsEditing(false);
      return;
    }

    setManualValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={className}>
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value)}
          onBlur={submitManualValue}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitManualValue();
            if (e.key === 'Escape') {
              setManualValue(value);
              setIsEditing(false);
            }
          }}
          placeholder="YYMMDD"
          className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[12px] text-gray-900 placeholder:text-[11px] placeholder:text-gray-400 focus:border-black"
        />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value ? e.target.value : null)}
        className="pointer-events-none absolute inset-0 opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={handleSingleClick}
        onDoubleClick={handleDoubleClick}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 text-left transition-colors hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-black"
      >
        <span
          className={`min-w-0 truncate whitespace-nowrap text-[12px] leading-none ${
            value ? 'text-gray-900' : 'text-gray-400'
          }`}
        >
          {value ? formatDateFieldValue(value) : emptyLabel}
        </span>
        <svg
          className="h-4 w-4 flex-shrink-0 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z"
          />
        </svg>
      </button>
    </div>
  );
}
