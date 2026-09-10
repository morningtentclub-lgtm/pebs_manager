'use client';

import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  EXPENSE_COLUMNS,
  PAYMENT_COLUMNS,
  ExportColumn,
  defaultSelectedKeys,
  groupsOf,
} from '@/lib/exportColumns';

type ExportTarget = { id: string; name: string };

type Props = {
  projects: ExportTarget[];
  onClose: () => void;
};

function ColumnPicker({
  columns,
  selected,
  onToggle,
  onSetAll,
  disabled,
}: {
  columns: ExportColumn[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSetAll: (next: boolean) => void;
  disabled: boolean;
}) {
  const groups = useMemo(() => groupsOf(columns), [columns]);

  return (
    <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
      <div className="flex justify-end gap-2 mb-2">
        <button type="button" onClick={() => onSetAll(true)} className="text-xs text-[--gray-700] hover:text-black underline">
          전체 선택
        </button>
        <button type="button" onClick={() => onSetAll(false)} className="text-xs text-[--gray-700] hover:text-black underline">
          전체 해제
        </button>
      </div>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group}>
            <div className="text-[11px] font-semibold text-[--gray-500] mb-1.5">{group}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {columns
                .filter((column) => column.group === group)
                .map((column) => (
                  <label key={column.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(column.key)}
                      onChange={() => onToggle(column.key)}
                      className="h-4 w-4 rounded border-[--border-dark] accent-black"
                    />
                    <span className={column.sensitive ? 'text-amber-700' : 'text-[--gray-700]'}>
                      {column.label}
                      {column.sensitive && ' ⚠'}
                    </span>
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 서버가 Content-Disposition 으로 내려준 파일명을 그대로 쓴다 (실패 시 직접 만든다) */
function fileNameFromResponse(response: Response, projects: ExportTarget[], isMulti: boolean) {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      // 디코딩 실패 시 아래 기본값으로
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  if (isMulti) return `지급지출내역_${projects.length}개_${today}.zip`;
  const name = (projects[0]?.name || 'project').replace(/[\\/:*?"<>|]/g, '_');
  return `${name}_지급지출내역.xlsx`;
}

export default function ExportModal({ projects, onClose }: Props) {
  const isMulti = projects.length > 1;
  const [includePayments, setIncludePayments] = useState(true);
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const [includeTotals, setIncludeTotals] = useState(true);
  const [paymentKeys, setPaymentKeys] = useState(() => new Set(defaultSelectedKeys(PAYMENT_COLUMNS)));
  const [expenseKeys, setExpenseKeys] = useState(() => new Set(defaultSelectedKeys(EXPENSE_COLUMNS)));
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (key: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setAll = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, columns: ExportColumn[]) => (on: boolean) => {
    setter(on ? new Set(columns.map((c) => c.key)) : new Set());
  };

  const sensitiveSelected = [
    ...PAYMENT_COLUMNS.filter((c) => c.sensitive && includePayments && paymentKeys.has(c.key)),
    ...EXPENSE_COLUMNS.filter((c) => c.sensitive && includeExpenses && expenseKeys.has(c.key)),
  ];

  const canExport =
    (includePayments && paymentKeys.size > 0) || (includeExpenses && expenseKeys.size > 0);

  const handleExport = async () => {
    setError('');
    setDownloading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('로그인이 필요합니다.');

      const response = await fetch('/api/projects/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectIds: projects.map((project) => project.id),
          sheets: { payments: includePayments, expenses: includeExpenses },
          paymentColumns: [...paymentKeys],
          expenseColumns: [...expenseKeys],
          includeTotals,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `엑셀 생성에 실패했습니다. (status ${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileNameFromResponse(response, projects, isMulti);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '엑셀 생성에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-[--border] px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-bold">엑셀로 내보내기</h2>
          <p className="text-xs text-[--gray-500] mt-1">
            {isMulti
              ? `${projects.length}개 프로젝트 · 프로젝트마다 파일 하나씩, ZIP으로 받습니다.`
              : projects[0]?.name}
          </p>
          <p className="text-xs text-[--gray-500] mt-0.5">
            포함할 시트와 열을 고르세요. 엑셀 헤더에 자동필터가 걸려 있어 정렬·필터는 엑셀에서 바로 할 수 있습니다.
          </p>
        </div>

        <div className="px-6 py-5 space-y-6">
          <section>
            <label className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={includePayments}
                onChange={(e) => setIncludePayments(e.target.checked)}
                className="h-4 w-4 rounded border-[--border-dark] accent-black"
              />
              <span className="text-sm font-semibold">지급내역 시트</span>
            </label>
            <ColumnPicker
              columns={PAYMENT_COLUMNS}
              selected={paymentKeys}
              onToggle={toggle(setPaymentKeys)}
              onSetAll={setAll(setPaymentKeys, PAYMENT_COLUMNS)}
              disabled={!includePayments}
            />
          </section>

          <section className="border-t border-[--border] pt-5">
            <label className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={includeExpenses}
                onChange={(e) => setIncludeExpenses(e.target.checked)}
                className="h-4 w-4 rounded border-[--border-dark] accent-black"
              />
              <span className="text-sm font-semibold">지출내역 시트</span>
            </label>
            <ColumnPicker
              columns={EXPENSE_COLUMNS}
              selected={expenseKeys}
              onToggle={toggle(setExpenseKeys)}
              onSetAll={setAll(setExpenseKeys, EXPENSE_COLUMNS)}
              disabled={!includeExpenses}
            />
          </section>

          <section className="border-t border-[--border] pt-5">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeTotals}
                onChange={(e) => setIncludeTotals(e.target.checked)}
                className="h-4 w-4 rounded border-[--border-dark] accent-black"
              />
              <span className="text-sm text-[--gray-700]">표 아래에 통화별 합계 행 넣기</span>
            </label>
          </section>

          {sensitiveSelected.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span className="font-semibold">개인정보가 포함됩니다:</span>{' '}
              {sensitiveSelected.map((c) => c.label).join(', ')}. 파일 공유 범위를 확인해주세요.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-[--border] px-6 py-4 flex justify-end gap-2 rounded-b-2xl">
          <button type="button" onClick={onClose} className="btn-outline px-4 py-2 rounded-xl text-sm">
            취소
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={downloading || !canExport}
            className="btn-primary px-4 py-2 rounded-xl text-sm disabled:opacity-60"
          >
            {downloading ? '생성 중...' : isMulti ? `ZIP 다운로드 (${projects.length}개)` : '엑셀 다운로드'}
          </button>
        </div>
      </div>
    </div>
  );
}
