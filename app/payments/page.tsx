'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Expense, Payment, PaymentMethod, Project, StaffType } from '@/lib/types';

type SortMode = 'project' | 'recipient' | 'updated' | 'staff' | 'method';
type ViewStatus = 'pending' | 'completed';
type PaymentListItem = Payment & {
  source: 'payment' | 'expense';
  expense_id?: string;
  method_label?: string;
};
type PersonalExpenseRow = {
  id: string;
  project_id: string;
  amount: number | null;
  vendor: string | null;
  description: string | null;
  note: string | null;
  payer_name: string | null;
  payer_bank_name: string | null;
  payer_account_number: string | null;
  payment_status: string | null;
  payment_date: string | null;
  created_at: string;
  is_company_expense: boolean | null;
};

const normalizePaymentStatus = (value: string | null) => {
  if (value === 'completed' || value === 'pending') {
    return value;
  }
  return 'pending';
};

export default function PaymentListPage() {
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [staffTypes, setStaffTypes] = useState<StaffType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('project');
  const [viewStatus, setViewStatus] = useState<ViewStatus>('pending');
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessPassword, setAccessPassword] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessChecking, setAccessChecking] = useState(false);
  const fetchAll = useCallback(async (silent?: boolean) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage('');
    try {
      const [
        { data: paymentData, error: paymentError },
        { data: projectData, error: projectError },
        { data: staffData },
        { data: methodData },
        { data: expenseData, error: expenseError },
      ] =
        await Promise.all([
          supabase
            .from('payments')
            .select(
              'id, project_id, item, recipient, company_name, amount, payment_method_id, staff_type_id, bank_name, account_number, resident_number, id_card_url, bankbook_url, payment_status, invoice_date, payment_date, memo, created_at, updated_at'
            )
            .order('created_at', { ascending: false }),
          supabase.from('projects').select('id, name, client, status, created_at, updated_at'),
          supabase.from('staff_types').select('*'),
          supabase.from('payment_methods').select('*'),
          supabase
            .from('expenses')
            .select(
              'id, project_id, amount, vendor, description, note, payer_name, payer_bank_name, payer_account_number, payment_status, payment_date, created_at, is_company_expense'
            )
            .eq('is_company_expense', false)
            .order('created_at', { ascending: false }),
        ]);

      if (paymentError) throw paymentError;
      if (projectError) throw projectError;
      if (expenseError) throw expenseError;

      const normalizedProjects: Project[] = (projectData || []).map((project) => ({
        id: project.id,
        name: project.name,
        client: project.client ?? null,
        status: project.status === 'pending' ? 'ongoing' : project.status,
        created_at: project.created_at,
        updated_at: project.updated_at,
      }));

      const normalizedPayments: PaymentListItem[] = (paymentData || []).map((payment) => ({
        id: payment.id,
        project_id: payment.project_id,
        item: payment.item ?? null,
        recipient: payment.recipient ?? null,
        company_name: payment.company_name ?? null,
        amount: payment.amount ?? 0,
        payment_method_id: payment.payment_method_id ?? null,
        staff_type_id: payment.staff_type_id ?? null,
        bank_name: payment.bank_name ?? null,
        account_number: payment.account_number ?? null,
        resident_number: payment.resident_number ?? null,
        id_card_url: payment.id_card_url ?? null,
        bankbook_url: payment.bankbook_url ?? null,
        payment_status: payment.payment_status || 'pending',
        invoice_date: payment.invoice_date ?? null,
        payment_date: payment.payment_date ?? null,
        memo: payment.memo ?? null,
        created_at: payment.created_at,
        updated_at: payment.updated_at ?? null,
        source: 'payment',
      }));

      const personalExpenses: PaymentListItem[] = (expenseData || []).map((expense: PersonalExpenseRow) => ({
        id: `expense-${expense.id}`,
        expense_id: expense.id,
        project_id: expense.project_id,
        item: '개인지출',
        recipient: expense.payer_name || '개인지출',
        company_name: expense.vendor ?? null,
        amount: expense.amount ?? 0,
        payment_method_id: null,
        staff_type_id: null,
        bank_name: expense.payer_bank_name ?? null,
        account_number: expense.payer_account_number ?? null,
        resident_number: null,
        id_card_url: null,
        bankbook_url: null,
        payment_status: normalizePaymentStatus(expense.payment_status),
        invoice_date: null,
        payment_date: expense.payment_date ?? null,
        memo: expense.description || expense.note || null,
        created_at: expense.created_at,
        updated_at: null,
        source: 'expense',
        method_label: '개인지출',
      }));

      setPayments([...normalizedPayments, ...personalExpenses]);
      setProjects(normalizedProjects);
      setStaffTypes(staffData || []);
      setPaymentMethods(methodData || []);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      console.error('지급 내역 리스트 불러오기 실패:', error);
      const errorObject = (error && typeof error === 'object') ? (error as { message?: string; details?: string; hint?: string; code?: string }) : {};
      const message = errorObject.message || (error instanceof Error ? error.message : '');
      const extraParts = [errorObject.details, errorObject.hint, errorObject.code].filter(Boolean);
      const extra = extraParts.length > 0 ? extraParts.join(' ') : '';
      const combined = [message, extra].filter(Boolean).join(' ');
      let helper = '';
      if (combined.includes('payment_status')) {
        helper = 'payment_status 컬럼 추가 여부를 확인해주세요.';
      } else if (combined.includes('updated_at')) {
        helper = 'updated_at 컬럼 추가 여부를 확인해주세요.';
      } else if (combined.toLowerCase().includes('row-level security')) {
        helper = 'RLS 정책을 확인해주세요.';
      }
      const detail = combined ? ` (${combined})` : '';
      setErrorMessage(`지급 내역을 불러오지 못했습니다.${detail} ${helper}`.trim());
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.sessionStorage.getItem('paymentsAccess');
    if (stored === '1') {
      setAccessGranted(true);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessGranted) {
      fetchAll();
    }
  }, [accessGranted, fetchAll]);

  useEffect(() => {
    const handleFocus = () => {
      if (!accessGranted) return;
      fetchAll(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && accessGranted) {
        fetchAll(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchAll, accessGranted]);

  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const projectOrderMap = useMemo(() => {
    const ordered = [...projects].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return new Map(ordered.map((project, index) => [project.name, index]));
  }, [projects]);
  const staffMap = useMemo(() => new Map(staffTypes.map((st) => [st.id, st.name])), [staffTypes]);
  const methodMap = useMemo(() => new Map(paymentMethods.map((pm) => [pm.id, pm.name])), [paymentMethods]);

  const formatResident = (value: string | null) => {
    if (!value) return '';
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length === 13) {
      return `${digits.slice(0, 6)}-${digits.slice(6)}`;
    }
    return digits;
  };


  const buildGroups = (items: PaymentListItem[]) => {
    const groups = new Map<string, PaymentListItem[]>();
    const getKey = (payment: PaymentListItem) => {
      switch (sortMode) {
        case 'recipient':
          return payment.recipient || '미지정';
        case 'staff':
          return staffMap.get(payment.staff_type_id || 0) || '미지정';
        case 'method':
          return payment.method_label || methodMap.get(payment.payment_method_id || 0) || '미지정';
        case 'updated':
          return '전체';
        case 'project':
        default:
          return projectMap.get(payment.project_id) || '미지정';
      }
    };

    items.forEach((payment) => {
      const key = getKey(payment);
      const list = groups.get(key) || [];
      list.push(payment);
      groups.set(key, list);
    });

    const sortedGroups = Array.from(groups.entries()).map(([key, list]) => {
      const sorted = [...list].sort((a, b) => {
        const aTime =
          sortMode === 'updated'
            ? new Date(a.updated_at || a.created_at).getTime()
            : new Date(a.created_at).getTime();
        const bTime =
          sortMode === 'updated'
            ? new Date(b.updated_at || b.created_at).getTime()
            : new Date(b.created_at).getTime();
        return bTime - aTime;
      });
      return { key, items: sorted };
    });

    if (sortMode === 'project') {
      sortedGroups.sort((a, b) => {
        const aIndex = projectOrderMap.get(a.key) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = projectOrderMap.get(b.key) ?? Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
      });
    } else {
      sortedGroups.sort((a, b) => a.key.localeCompare(b.key, 'ko-KR'));
    }

    return sortedGroups;
  };

  const pendingPayments = payments.filter((payment) => payment.payment_status !== 'completed');
  const completedPayments = payments.filter((payment) => payment.payment_status === 'completed');
  const activePayments = viewStatus === 'completed' ? completedPayments : pendingPayments;
  const activeGroups = useMemo(
    () => buildGroups(activePayments),
    [activePayments, sortMode, staffMap, methodMap, projectMap, projectOrderMap]
  );

  const normalizeDateValue = (value: string | null | undefined) => {
    if (!value) return '';
    return value.includes('T') ? value.slice(0, 10) : value;
  };

  const resolveMethodName = (payment: PaymentListItem) =>
    payment.method_label || methodMap.get(payment.payment_method_id || 0) || '';

  const updatePaymentDates = async (
    payment: PaymentListItem,
    updates: { invoice_date?: string | null; payment_date?: string | null }
  ) => {
    try {
      if (payment.source === 'expense') {
        if (!Object.prototype.hasOwnProperty.call(updates, 'payment_date')) return;
        const { error } = await supabase
          .from('expenses')
          .update({
            payment_date: updates.payment_date ?? null,
          })
          .eq('id', payment.expense_id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payments')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payment.id);

        if (error) throw error;
      }

      setPayments((prev) =>
        prev.map((item) =>
          item.id === payment.id
            ? { ...item, ...updates, updated_at: new Date().toISOString() }
            : item
        )
      );
    } catch (error) {
      console.error('지급 내역 날짜 업데이트 실패:', error);
      alert('지급 내역 날짜 업데이트에 실패했습니다.');
    }
  };

  const togglePaymentStatus = async (payment: PaymentListItem, nextStatus: 'pending' | 'completed') => {
    try {
      if (payment.source === 'expense') {
        const { error } = await supabase
          .from('expenses')
          .update({ payment_status: nextStatus })
          .eq('id', payment.expense_id);

        if (error) throw error;
      } else {
        const updates: { payment_status: 'pending' | 'completed'; payment_date?: string } = {
          payment_status: nextStatus,
        };
        if (nextStatus === 'completed' && !payment.payment_date) {
          updates.payment_date = new Date().toISOString().slice(0, 10);
        }
        const { error } = await supabase
          .from('payments')
          .update(updates)
          .eq('id', payment.id);

        if (error) throw error;
      }

      setPayments((prev) =>
        prev.map((item) =>
          item.id === payment.id
            ? {
                ...item,
                payment_status: nextStatus,
                payment_date:
                  payment.source === 'payment' && nextStatus === 'completed' && !item.payment_date
                    ? new Date().toISOString().slice(0, 10)
                    : item.payment_date,
                updated_at: new Date().toISOString(),
              }
            : item
        )
      );
    } catch (error) {
      console.error('지급 상태 업데이트 실패:', error);
      alert('지급 상태 업데이트에 실패했습니다.');
    }
  };

  const getActualAmount = (payment: PaymentListItem) => {
    const methodName = payment.method_label || methodMap.get(payment.payment_method_id || 0) || '';
    if (methodName === '세금계산서') {
      return Math.round((payment.amount || 0) * 1.1);
    }
    if (methodName === '원천징수') {
      return Math.round((payment.amount || 0) * 0.967);
    }
    return payment.amount || 0;
  };

  const resolveStaffLabel = (payment: PaymentListItem) => {
    const staffName = staffMap.get(payment.staff_type_id || 0);
    if (!staffName) {
      return payment.item || '-';
    }
    if (staffName === '기타' && payment.item) {
      return `기타(${payment.item})`;
    }
    return staffName;
  };

  const handleAccessSubmit = async () => {
    if (!accessPassword) return;
    setAccessChecking(true);
    setAccessError('');
    try {
      const response = await fetch('/api/payments-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: accessPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAccessError(data?.error || '비밀번호가 올바르지 않습니다.');
        setAccessChecking(false);
        return;
      }
      window.sessionStorage.setItem('paymentsAccess', '1');
      setAccessGranted(true);
      setAccessPassword('');
    } catch (error) {
      console.error('지급 내역 접근 확인 실패:', error);
      setAccessError('비밀번호 확인에 실패했습니다.');
    } finally {
      setAccessChecking(false);
    }
  };

  if (!accessGranted) {
    return (
      <div className="min-h-screen page-shell">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-3xl font-bold">지급 내역 리스트</h1>
          <p className="mt-2 text-sm text-gray-600">보안을 위해 비밀번호를 입력해주세요.</p>
          <div className="mt-8 max-w-md rounded-2xl border border-[--border] bg-white p-6 shadow-sm">
            <label className="block text-sm font-medium text-[--gray-700] mb-2">비밀번호</label>
            <input
              type="password"
              value={accessPassword}
              onChange={(e) => setAccessPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAccessSubmit();
                }
              }}
              className="h-11 w-full px-3 border border-[--border] rounded-xl bg-white text-sm"
              placeholder="비밀번호 입력"
            />
            {accessError && (
              <div className="mt-2 text-xs text-red-600">{accessError}</div>
            )}
            <button
              type="button"
              onClick={handleAccessSubmit}
              disabled={!accessPassword || accessChecking}
              className="btn-primary mt-4 h-11 w-full rounded-xl text-sm disabled:opacity-60"
            >
              {accessChecking ? '확인 중...' : '확인'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-shell">
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#1D32FB] font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                프로젝트 목록으로
              </Link>
              <h1 className="mt-2 text-3xl font-bold" style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                지급 내역 리스트
              </h1>
              <p className="mt-1 text-sm text-gray-600 font-medium">전체 프로젝트의 지급 내역을 한눈에 확인합니다</p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdatedAt && (
                <span className="text-xs text-gray-400 font-medium">
                  업데이트 {new Date(lastUpdatedAt).toLocaleTimeString('ko-KR')}
                </span>
              )}
              <button
                type="button"
                onClick={() => fetchAll(true)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all disabled:opacity-60"
                disabled={refreshing}
              >
                <span className="flex items-center gap-2">
                  <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {refreshing ? '새로고침 중...' : '새로고침'}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 font-semibold">정렬</label>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#1D32FB] transition-all font-semibold bg-white"
                >
                  <option value="project">프로젝트별</option>
                  <option value="recipient">이름별</option>
                  <option value="updated">업데이트 순</option>
                  <option value="staff">항목별</option>
                  <option value="method">지급 방식별</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center">
              <svg className="animate-spin h-10 w-10" style={{ color: '#1D32FB' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          </div>
        ) : errorMessage ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-100">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-red-600 font-medium">{errorMessage}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-gray-100">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">지급 내역</h2>
                  <p className="mt-1 text-sm text-gray-600 font-medium">
                    {viewStatus === 'completed' ? '완료된 내역' : '대기 중인 내역'}을 확인합니다
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewStatus('pending')}
                    className={`px-4 py-2.5 rounded-lg text-[14px] font-semibold transition-all ${
                      viewStatus === 'pending'
                        ? 'text-white bg-black border border-black'
                        : 'bg-white text-gray-700 border border-gray-200 hover:border-black'
                    }`}
                  >
                    대기 내역 ({pendingPayments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewStatus('completed')}
                    className={`px-4 py-2.5 rounded-lg text-[14px] font-semibold transition-all ${
                      viewStatus === 'completed'
                        ? 'text-white bg-black border border-black'
                        : 'bg-white text-gray-700 border border-gray-200 hover:border-black'
                    }`}
                  >
                    완료 내역 ({completedPayments.length})
                  </button>
                </div>
              </div>

              {activeGroups.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">
                  {viewStatus === 'completed'
                    ? '완료 처리된 지급 내역이 없습니다.'
                    : '대기 중인 지급 내역이 없습니다.'}
                </p>
              ) : (
                <div className="mt-4 space-y-6">
                  {activeGroups.map((group) => (
                    <div key={`${viewStatus}-${group.key}`}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">{group.key}</h3>
                        <span className="text-xs text-gray-400">{group.items.length}건</span>
                      </div>
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="min-w-[1200px] table-fixed divide-y divide-gray-200">
                          <colgroup>
                            <col className="w-[12%]" />
                            <col className="w-[12%]" />
                            <col className="w-[9%]" />
                            <col className="w-[9%]" />
                            <col className="w-[9%]" />
                            <col className="w-[9%]" />
                            <col className="w-[14%]" />
                            <col className="w-[9%]" />
                            <col className="w-[9%]" />
                            <col className="w-[8%]" />
                          </colgroup>
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">프로젝트</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">수령인</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">항목</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">지급방식</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">공급가액</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">실입금액</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">계좌정보</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">세금계산서 발행일</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">지급일</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap text-center">완료</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {group.items.map((payment) => {
                              const methodName = resolveMethodName(payment);
                              const isInvoice = payment.source === 'payment' && methodName === '세금계산서';
                              const isWithholding = payment.source === 'payment' && methodName === '원천징수';
                              const isPersonalExpense = payment.source === 'expense';
                              const invoiceValue = normalizeDateValue(payment.invoice_date);
                              const paymentValue = normalizeDateValue(payment.payment_date);
                              return (
                                <tr key={payment.id}>
                                  <td className="px-3 py-3 text-sm text-gray-900">
                                    {projectMap.get(payment.project_id) || '-'}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-900">
                                    <div>{payment.recipient || '-'}</div>
                                    {payment.company_name && (
                                      <div className="text-xs text-gray-500">{payment.company_name}</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-900">
                                    {resolveStaffLabel(payment)}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-900">
                                    {methodName || '-'}
                                  </td>
                                  <td className="px-3 py-3 text-sm font-semibold text-gray-900">
                                    {payment.amount.toLocaleString()}원
                                  </td>
                                  <td className="px-3 py-3 text-sm font-semibold text-gray-900">
                                    {payment.source === 'expense' ? '-' : `${getActualAmount(payment).toLocaleString()}원`}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-700">
                                    {(() => {
                                      const accountNumber = payment.account_number || '';
                                      const bankName = payment.bank_name || '';
                                      const residentNumber = payment.resident_number || '';
                                      const accountLabel = accountNumber
                                        ? `${bankName ? `${bankName} ` : ''}${accountNumber}`
                                        : '';
                                      const residentLabel = formatResident(residentNumber);
                                      const hasAccount = accountLabel.length > 0;
                                      const hasResident = residentLabel.length > 0;
                                      if (!hasAccount && !hasResident) {
                                        return null;
                                      }
                                      const isSingleLine = (hasAccount ? 1 : 0) + (hasResident ? 1 : 0) === 1;
                                      return (
                                        <div className={`flex h-full flex-col ${isSingleLine ? 'justify-center' : ''}`}>
                                          {hasAccount && <div>{accountLabel}</div>}
                                          {hasResident && (
                                            <div className="text-xs text-gray-400">
                                              주민 {residentLabel}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-900">
                                    {isInvoice ? (
                                      <div>
                                        <div className="relative">
                                          <input
                                            id={`invoice-${payment.id}`}
                                            type="date"
                                            className={`w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-[#1D32FB] focus:outline-none ${
                                              invoiceValue ? 'text-gray-900' : 'text-transparent'
                                            }`}
                                            value={invoiceValue}
                                            onChange={(e) =>
                                              updatePaymentDates(payment, {
                                                invoice_date: e.target.value ? e.target.value : null,
                                              })
                                            }
                                          />
                                          {!invoiceValue && (
                                            <label
                                              htmlFor={`invoice-${payment.id}`}
                                              className="absolute inset-0 flex items-center px-2 text-xs text-gray-400 cursor-pointer"
                                            >
                                              입력
                                            </label>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          className="mt-1 text-xs text-gray-400 hover:text-gray-600"
                                          onClick={() => {
                                            if (confirm('세금계산서 발행일을 초기화할까요?')) {
                                              updatePaymentDates(payment, { invoice_date: null });
                                            }
                                          }}
                                        >
                                          발행일 초기화
                                        </button>
                                      </div>
                                    ) : isPersonalExpense ? (
                                      <span className="text-gray-500">개인 지출</span>
                                    ) : isWithholding ? (
                                      <span className="text-gray-500">원천징수</span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-900">
                                    {payment.source === 'payment' || payment.source === 'expense' ? (
                                      <div>
                                        <div className="relative">
                                          <input
                                            id={`payment-${payment.id}`}
                                            type="date"
                                            className={`w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-[#1D32FB] focus:outline-none ${
                                              paymentValue ? 'text-gray-900' : 'text-transparent'
                                            }`}
                                            value={paymentValue}
                                            onChange={(e) =>
                                              updatePaymentDates(payment, {
                                                payment_date: e.target.value ? e.target.value : null,
                                              })
                                            }
                                          />
                                          {!paymentValue && (
                                            <label
                                              htmlFor={`payment-${payment.id}`}
                                              className="absolute inset-0 flex items-center px-2 text-xs text-gray-400 cursor-pointer"
                                            >
                                              입력
                                            </label>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          className="mt-1 text-xs text-gray-400 hover:text-gray-600"
                                          onClick={() => {
                                            if (confirm('지급일을 초기화할까요?')) {
                                              updatePaymentDates(payment, {
                                                payment_date: null,
                                              });
                                            }
                                          }}
                                        >
                                          지급일 초기화
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-900 text-center whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={payment.payment_status === 'completed'}
                                      onChange={(e) => togglePaymentStatus(payment, e.target.checked ? 'completed' : 'pending')}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
