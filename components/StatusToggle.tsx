'use client';

type PaymentStatus = 'pending' | 'completed';

type StatusToggleProps = {
  value: PaymentStatus;
  onChange: (nextValue: PaymentStatus) => void;
  className?: string;
};

export default function StatusToggle({
  value,
  onChange,
  className = '',
}: StatusToggleProps) {
  return (
    <div
      className={`inline-flex items-center rounded-md border border-gray-200 bg-white p-0.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange('pending')}
        className={`px-2.5 py-1 text-[12px] font-semibold rounded transition-colors ${
          value === 'pending'
            ? 'bg-gray-900 text-white'
            : 'text-gray-500 hover:text-gray-800'
        }`}
      >
        대기
      </button>
      <button
        type="button"
        onClick={() => onChange('completed')}
        className={`px-2.5 py-1 text-[12px] font-semibold rounded transition-colors ${
          value === 'completed'
            ? 'bg-green-600 text-white'
            : 'text-gray-500 hover:text-gray-800'
        }`}
      >
        완료
      </button>
    </div>
  );
}
