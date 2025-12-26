'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Payment, PaymentMethod, Project, StaffType } from '@/lib/types';

type SortMode = 'project' | 'recipient' | 'updated' | 'staff' | 'method';
type ViewStatus = 'pending' | 'completed';

export default function PaymentListPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [staffTypes, setStaffTypes] = useState<StaffType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('project');
  const [viewStatus, setViewStatus] = useState<ViewStatus>('pending');
  const fetchAll = useCallback(async (silent?: boolean) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage('');
    try {
      const [{ data: paymentData, error: paymentError }, { data: projectData, error: projectError }, { data: staffData }, { data: methodData }] =
        await Promise.all([
          supabase
            .from('payments')
            .select(
              'id, project_id, recipient, amount, payment_method_id, staff_type_id, bank_name, account_number, resident_number, business_registration_number, payment_status, created_at, updated_at'
            )
            .order('created_at', { ascending: false }),
          supabase.from('projects').select('id, name, status, created_at, updated_at'),
          supabase.from('staff_types').select('*'),
          supabase.from('payment_methods').select('*'),
        ]);

      if (paymentError) throw paymentError;
      if (projectError) throw projectError;

      const normalizedProjects = (projectData || []).map((project) => ({
        ...project,
        status: project.status === 'pending' ? 'ongoing' : project.status,
      }));

      const normalizedPayments: Payment[] = (paymentData || []).map((payment) => ({
        id: payment.id,
        project_id: payment.project_id,
        item: payment.item ?? null,
        recipient: payment.recipient ?? null,
        amount: payment.amount ?? 0,
        payment_method_id: payment.payment_method_id ?? null,
        staff_type_id: payment.staff_type_id ?? null,
        bank_name: payment.bank_name ?? null,
        account_number: payment.account_number ?? null,
        resident_number: payment.resident_number ?? null,
        business_registration_number: payment.business_registration_number ?? null,
        id_card_url: payment.id_card_url ?? null,
        bankbook_url: payment.bankbook_url ?? null,
        payment_status: payment.payment_status || 'pending',
        invoice_date: payment.invoice_date ?? null,
        payment_date: payment.payment_date ?? null,
        memo: payment.memo ?? null,
        created_at: payment.created_at,
        updated_at: payment.updated_at ?? null,
      }));

      setPayments(normalizedPayments);
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
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const handleFocus = () => fetchAll(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAll(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchAll]);

  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const projectOrderMap = useMemo(() => {
    const ordered = [...projects].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return new Map(ordered.map((project, index) => [project.name, index]));
  }, [projects]);
  const staffMap = useMemo(() => new Map(staffTypes.map((st) => [st.id, st.name])), [staffTypes]);
  const methodMap = useMemo(() => new Map(paymentMethods.map((pm) => [pm.id, pm.name])), [paymentMethods]);

  const maskAccount = (value: string | null) => {
    if (!value) return '-';
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length <= 4) return digits;
    return `****${digits.slice(-4)}`;
  };

  const maskResident = (value: string | null) => {
    if (!value) return '-';
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length < 7) return digits;
    return `${digits.slice(0, 6)}-*******`;
  };

  const maskBusiness = (value: string | null) => {
    if (!value) return '-';
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length < 5) return digits;
    return `${digits.slice(0, 3)}-**-${digits.slice(-2)}`;
  };

  const buildGroups = (items: Payment[]) => {
    const groups = new Map<string, Payment[]>();
    const getKey = (payment: Payment) => {
      switch (sortMode) {
        case 'recipient':
          return payment.recipient || '미지정';
        case 'staff':
          return staffMap.get(payment.staff_type_id || 0) || '미지정';
        case 'method':
          return methodMap.get(payment.payment_method_id || 0) || '미지정';
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
        const aTime = new Date(a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.updated_at || b.created_at).getTime();
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

  const togglePaymentStatus = async (payment: Payment, nextStatus: 'pending' | 'completed') => {
    try {
      const { error } = await supabase
        .from('payments')
        .update({ payment_status: nextStatus })
        .eq('id', payment.id);

      if (error) throw error;

      setPayments((prev) =>
        prev.map((item) =>
          item.id === payment.id
            ? { ...item, payment_status: nextStatus, updated_at: new Date().toISOString() }
            : item
        )
      );
    } catch (error) {
      console.error('지급 상태 업데이트 실패:', error);
      alert('지급 상태 업데이트에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #fafbfc 0%, #f0f2ff 50%, #fafbfc 100%)' }}>
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#1D32FB] font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                프로젝트 목록으로
              </Link>
              <h1 className="mt-2 text-3xl font-bold" style={{ background: 'linear-gradient(135deg, #1D32FB 0%, #4A5BFF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      viewStatus === 'pending'
                        ? 'text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={viewStatus === 'pending' ? { background: 'linear-gradient(135deg, #1D32FB 0%, #4A5BFF 100%)' } : {}}
                  >
                    대기 내역 ({pendingPayments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewStatus('completed')}
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      viewStatus === 'completed'
                        ? 'text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={viewStatus === 'completed' ? { background: 'linear-gradient(135deg, #1D32FB 0%, #4A5BFF 100%)' } : {}}
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
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">프로젝트</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">수령인</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">항목</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">지급방식</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">금액</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">계좌정보</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">완료</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {group.items.map((payment) => (
                              <tr key={payment.id}>
                                <td className="px-3 py-3 text-sm text-gray-900">
                                  {projectMap.get(payment.project_id) || '-'}
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-900">{payment.recipient || '-'}</td>
                                <td className="px-3 py-3 text-sm text-gray-900">
                                  {staffMap.get(payment.staff_type_id || 0) || '-'}
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-900">
                                  {methodMap.get(payment.payment_method_id || 0) || '-'}
                                </td>
                                <td className="px-3 py-3 text-sm font-semibold text-gray-900">
                                  {payment.amount.toLocaleString()}원
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-700">
                                  {payment.bank_name ? `${payment.bank_name} ${maskAccount(payment.account_number)}` : '-'}
                                  <div className="text-xs text-gray-400">
                                    주민 {maskResident(payment.resident_number)} · 사업자 {maskBusiness(payment.business_registration_number)}
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-900">
                                  <input
                                    type="checkbox"
                                    checked={payment.payment_status === 'completed'}
                                    onChange={(e) => togglePaymentStatus(payment, e.target.checked ? 'completed' : 'pending')}
                                  />
                                </td>
                              </tr>
                            ))}
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
