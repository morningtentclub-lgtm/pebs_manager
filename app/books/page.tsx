'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type BookPurchase = {
  id: string;
  requester_name: string;
  purchase_date: string;
  aladin_url: string | null;
  title: string | null;
  author: string | null;
  publisher: string | null;
  price: number | null;
  isbn13: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
};

const NAME_OPTIONS = [
  '김예찬',
  '박형진',
  '이주호',
  '김상준',
  '방인경',
  '안재형',
  '황현지',
  '이일주',
];

const formatAmount = (value: string) => {
  const number = value.replace(/[^0-9]/g, '');
  if (!number) return '';
  return Number(number).toLocaleString('ko-KR');
};

const parseAmount = (value: string) => value.replace(/[^0-9]/g, '');

const getMonthRange = (dateString: string) => {
  const [year, month] = dateString.split('-').map(Number);
  if (!year || !month) {
    return null;
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  return { startStr, endStr };
};

export default function BookSupportPage() {
  const [purchases, setPurchases] = useState<BookPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [monthlyTotal, setMonthlyTotal] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<'updated' | 'requester'>('updated');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);

  const [form, setForm] = useState({
    aladin_url: '',
    requester_name: '',
    purchase_date: '',
    title: '',
    author: '',
    publisher: '',
    price: '',
    isbn13: '',
    note: '',
  });

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    setListError('');
    const { data, error } = await supabase
      .from('book_purchases')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      const message = error.message || '알 수 없는 오류';
      const helper = message.includes('relation')
        ? ' (book_support.sql 적용 여부를 확인해주세요.)'
        : message.includes('row-level security')
          ? ' (RLS 정책을 확인해주세요.)'
          : '';
      console.error('도서지원 목록 불러오기 실패:', error);
      setPurchases([]);
      setListError(`도서지원 목록을 불러오지 못했습니다.${message ? ` (${message})` : ''}${helper}`);
    } else {
      setPurchases((data || []) as BookPurchase[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  useEffect(() => {
    const name = form.requester_name;
    const date = form.purchase_date;
    if (!name || !date) {
      setMonthlyTotal(null);
      return;
    }
    const range = getMonthRange(date);
    if (!range) {
      setMonthlyTotal(null);
      return;
    }
    const fetchMonthly = async () => {
      const { data, error } = await supabase
        .from('book_purchases')
        .select('price')
        .eq('requester_name', name)
        .gte('purchase_date', range.startStr)
        .lt('purchase_date', range.endStr);

      if (error) {
        console.error(error);
        setMonthlyTotal(null);
        return;
      }
      const total = (data || []).reduce((sum, row) => sum + (row.price || 0), 0);
      setMonthlyTotal(total);
    };
    fetchMonthly();
  }, [form.requester_name, form.purchase_date]);

  const priceValue = useMemo(() => Number(parseAmount(form.price) || 0), [form.price]);
  const willExceedLimit = monthlyTotal !== null && priceValue > 0 && monthlyTotal + priceValue > 100000;

  const handleLookup = async () => {
    if (!form.aladin_url.trim()) {
      setFormError('알라딘 링크를 입력해주세요.');
      return;
    }
    setFormError('');
    setLookupLoading(true);
    try {
      const response = await fetch('/api/books/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: form.aladin_url }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data?.error || '도서 정보를 가져오지 못했습니다.');
      } else {
        setForm((prev) => ({
          ...prev,
          title: data.title || '',
          author: data.author || '',
          publisher: data.publisher || '',
          price: data.price ? String(data.price) : '',
          isbn13: data.isbn13 || '',
        }));
      }
    } catch (error) {
      console.error(error);
      setFormError('도서 정보를 가져오지 못했습니다.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!form.requester_name || !form.purchase_date) {
      setFormError('이름과 구매일을 입력해주세요.');
      return;
    }
    if (!form.title.trim()) {
      setFormError('책 제목을 입력해주세요.');
      return;
    }
    if (!priceValue) {
      setFormError('가격을 입력해주세요.');
      return;
    }

    const payload = {
      requester_name: form.requester_name,
      purchase_date: form.purchase_date,
      aladin_url: form.aladin_url.trim() || null,
      title: form.title.trim() || null,
      author: form.author.trim() || null,
      publisher: form.publisher.trim() || null,
      price: priceValue || null,
      isbn13: form.isbn13.trim() || null,
      note: form.note.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (editingPurchaseId) {
      const { error } = await supabase
        .from('book_purchases')
        .update(payload)
        .eq('id', editingPurchaseId);
      if (error) {
        console.error(error);
        setFormError('수정에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
    } else {
      const { error } = await supabase.from('book_purchases').insert([payload]);
      if (error) {
        console.error(error);
        setFormError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
    }

    setForm({
      aladin_url: '',
      requester_name: '',
      purchase_date: '',
      title: '',
      author: '',
      publisher: '',
      price: '',
      isbn13: '',
      note: '',
    });
    setMonthlyTotal(null);
    setEditingPurchaseId(null);
    fetchPurchases();
  };

  const handleEdit = (purchase: BookPurchase) => {
    setEditingPurchaseId(purchase.id);
    setForm({
      aladin_url: purchase.aladin_url || '',
      requester_name: purchase.requester_name,
      purchase_date: purchase.purchase_date,
      title: purchase.title || '',
      author: purchase.author || '',
      publisher: purchase.publisher || '',
      price: purchase.price ? String(purchase.price) : '',
      isbn13: purchase.isbn13 || '',
      note: purchase.note || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingPurchaseId(null);
    setForm({
      aladin_url: '',
      requester_name: '',
      purchase_date: '',
      title: '',
      author: '',
      publisher: '',
      price: '',
      isbn13: '',
      note: '',
    });
    setFormError('');
    setMonthlyTotal(null);
  };

  const handleDelete = async (purchase: BookPurchase) => {
    if (!confirm('해당 구매 신청을 삭제할까요?')) return;
    const { error } = await supabase
      .from('book_purchases')
      .delete()
      .eq('id', purchase.id);
    if (error) {
      console.error(error);
      setFormError('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    fetchPurchases();
  };

  const filteredPurchases = purchases.filter((purchase) => {
    if (!searchQuery.trim()) return true;
    const target = (purchase.title || '').toLowerCase();
    return target.includes(searchQuery.trim().toLowerCase());
  });

  const sortedPurchases = [...filteredPurchases].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime();
    const bTime = new Date(b.updated_at || b.created_at).getTime();
    return bTime - aTime;
  });

  const groupedRows = useMemo(() => {
    if (sortMode !== 'requester') {
      return [];
    }
    const grouped = new Map<string, BookPurchase[]>();
    filteredPurchases.forEach((purchase) => {
      const key = purchase.requester_name;
      const list = grouped.get(key) || [];
      list.push(purchase);
      grouped.set(key, list);
    });

    const rows: Array<
      | { type: 'header'; id: string; title: string }
      | { type: 'purchase'; id: string; purchase: BookPurchase }
      | { type: 'subtotal'; id: string; label: string; amount: number }
    > = [];

    Array.from(grouped.keys())
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .forEach((name) => {
        const items = grouped.get(name) || [];
        items.sort((a, b) => {
          const aDate = new Date(a.purchase_date).getTime();
          const bDate = new Date(b.purchase_date).getTime();
          if (aDate !== bDate) return bDate - aDate;
          const aTime = new Date(a.updated_at || a.created_at).getTime();
          const bTime = new Date(b.updated_at || b.created_at).getTime();
          return bTime - aTime;
        });

        rows.push({ type: 'header', id: `header-${name}`, title: name });

        const monthMap = new Map<string, BookPurchase[]>();
        items.forEach((purchase) => {
          const monthKey = purchase.purchase_date.slice(0, 7);
          const monthItems = monthMap.get(monthKey) || [];
          monthItems.push(purchase);
          monthMap.set(monthKey, monthItems);
        });

        Array.from(monthMap.keys())
          .sort((a, b) => b.localeCompare(a))
          .forEach((monthKey) => {
            const monthItems = monthMap.get(monthKey) || [];
            monthItems.forEach((purchase) => {
              rows.push({ type: 'purchase', id: purchase.id, purchase });
            });
            const subtotal = monthItems.reduce((sum, purchase) => sum + (purchase.price || 0), 0);
            rows.push({
              type: 'subtotal',
              id: `subtotal-${name}-${monthKey}`,
              label: `${monthKey} 합계`,
              amount: subtotal,
            });
          });
      });

    return rows;
  }, [filteredPurchases, sortMode]);

  return (
    <div className="min-h-screen page-shell">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-[32px] font-semibold">도서지원</h1>
          <p className="text-sm text-[--gray-600]">알라딘 링크를 입력하면 책 정보를 자동으로 채웁니다.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <div className="bg-white border border-[--border] rounded-2xl p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">알라딘 링크</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={form.aladin_url}
                    onChange={(e) => setForm((prev) => ({ ...prev, aladin_url: e.target.value }))}
                    className="flex-1 min-w-0 h-11 px-3 border border-[--border] rounded-xl bg-white text-sm"
                    placeholder="https://www.aladin.co.kr/..."
                  />
                  <button
                    type="button"
                    onClick={handleLookup}
                    className="btn-primary h-11 w-full rounded-xl text-sm whitespace-nowrap sm:w-auto sm:min-w-[120px] sm:px-4"
                    disabled={lookupLoading}
                  >
                    {lookupLoading ? '가져오는 중' : '정보 가져오기'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">이름</label>
                <div className="relative">
                  <select
                    value={form.requester_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, requester_name: e.target.value }))}
                    className="h-11 w-full px-3 pr-10 border border-[--border] rounded-xl bg-white text-sm appearance-none"
                  >
                    <option value="">선택하세요</option>
                    {NAME_OPTIONS.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--gray-400]"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M5.5 7.5L10 12l4.5-4.5" />
                  </svg>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">구매일</label>
                <input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, purchase_date: e.target.value }))}
                  className="h-11 w-full px-3 border border-[--border] rounded-xl bg-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[--gray-700] mb-1">제목</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="h-11 w-full px-3 border border-[--border] rounded-xl bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[--gray-700] mb-1">저자</label>
                  <input
                    type="text"
                    value={form.author}
                    onChange={(e) => setForm((prev) => ({ ...prev, author: e.target.value }))}
                    className="h-11 w-full px-3 border border-[--border] rounded-xl bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[--gray-700] mb-1">출판사</label>
                  <input
                    type="text"
                    value={form.publisher}
                    onChange={(e) => setForm((prev) => ({ ...prev, publisher: e.target.value }))}
                    className="h-11 w-full px-3 border border-[--border] rounded-xl bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[--gray-700] mb-1">가격(판매가)</label>
                  <input
                    type="text"
                    value={formatAmount(form.price)}
                    onChange={(e) => setForm((prev) => ({ ...prev, price: parseAmount(e.target.value) }))}
                    className="h-11 w-full px-3 border border-[--border] rounded-xl bg-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">비고</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  className="min-h-[88px] w-full px-3 py-2 border border-[--border] rounded-xl bg-white text-sm resize-none"
                  placeholder="추가 메모가 있다면 입력해주세요."
                />
              </div>

              {monthlyTotal !== null && (
                <div className={`rounded-xl px-3 py-2 text-xs ${willExceedLimit ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-[--gray-50] text-[--gray-600] border border-[--border]'}`}>
                  이번 달 합계 {monthlyTotal.toLocaleString()}원 / 100,000원
                  {willExceedLimit && (
                    <span className="ml-2 font-semibold">한도 초과</span>
                  )}
                </div>
              )}

              {formError && (
                <div className="text-xs text-red-600">{formError}</div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="btn-primary flex-1 h-11 rounded-xl text-sm"
                >
                  {editingPurchaseId ? '수정 저장' : '저장'}
                </button>
                {editingPurchaseId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="btn-outline flex-1 h-11 rounded-xl text-sm"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-[--border] rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">도서 신청 목록</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 w-[200px] px-3 border border-[--border] rounded-xl text-sm"
                    placeholder="책 이름 검색"
                  />
                </div>
                <div className="relative">
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as 'updated' | 'requester')}
                    className="h-10 w-[160px] px-3 pr-9 border border-[--border] rounded-xl bg-white text-sm appearance-none"
                  >
                    <option value="updated">업데이트순</option>
                    <option value="requester">구매자별</option>
                  </select>
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--gray-400]"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M5.5 7.5L10 12l4.5-4.5" />
                  </svg>
                </div>
                <span className="text-xs text-[--gray-500]">{filteredPurchases.length}건</span>
              </div>
            </div>
            {listError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {listError}
              </div>
            )}
            {loading ? (
              <div className="text-sm text-[--gray-500]">불러오는 중...</div>
            ) : filteredPurchases.length === 0 ? (
              <div className="text-sm text-[--gray-500]">등록된 도서 신청이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="text-xs text-[--gray-500] uppercase border-b border-[--border]">
                    <tr>
                      <th className="py-2 text-left">구매일</th>
                      <th className="py-2 text-left">이름</th>
                      <th className="py-2 text-left">도서 정보</th>
                      <th className="py-2 text-right">가격</th>
                      <th className="py-2 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sortMode === 'requester' ? groupedRows : sortedPurchases.map((purchase) => ({
                      type: 'purchase' as const,
                      id: purchase.id,
                      purchase,
                    }))).map((row) => {
                      if (row.type === 'header') {
                        return (
                          <tr key={row.id} className="bg-[--gray-50]">
                            <td colSpan={5} className="py-2 text-sm font-semibold text-[--gray-700]">
                              {row.title}
                            </td>
                          </tr>
                        );
                      }
                      if (row.type === 'subtotal') {
                        return (
                          <tr key={row.id} className="bg-white">
                            <td colSpan={3} className="py-2 text-xs text-[--gray-500]">
                              {row.label}
                            </td>
                            <td className="py-2 text-right text-xs font-semibold text-[--gray-700]">
                              {row.amount.toLocaleString()}원
                            </td>
                            <td />
                          </tr>
                        );
                      }
                      const purchase = row.purchase;
                      return (
                        <tr key={row.id} className="border-b border-[--border]">
                          <td className="py-3">{purchase.purchase_date}</td>
                          <td className="py-3 font-medium">{purchase.requester_name}</td>
                          <td className="py-3">
                            <div className="font-medium text-[--foreground]">{purchase.title || '제목 없음'}</div>
                            <div className="text-xs text-[--gray-500]">
                              {purchase.author || '-'} · {purchase.publisher || '-'}
                            </div>
                            {purchase.note && (
                              <div className="text-xs text-[--gray-500] mt-1">
                                비고: {purchase.note}
                              </div>
                            )}
                            {purchase.aladin_url && (
                              <a
                                href={purchase.aladin_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-[--gray-500] hover:text-[--primary]"
                              >
                                알라딘 링크
                              </a>
                            )}
                          </td>
                          <td className="py-3 text-right font-semibold">
                            {purchase.price ? `${purchase.price.toLocaleString()}원` : '-'}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => handleEdit(purchase)}
                                className="text-[--primary] hover:text-[--primary-light]"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(purchase)}
                                className="text-[--accent] hover:text-[--accent-hover]"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
