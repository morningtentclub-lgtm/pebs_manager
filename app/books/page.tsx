'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type BookPurchase = {
  id: string;
  requester_name: string;
  purchase_date: string;
  aladin_url: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  price: number | null;
  isbn13: string | null;
  created_at: string;
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

  const [form, setForm] = useState({
    aladin_url: '',
    requester_name: '',
    purchase_date: '',
    title: '',
    author: '',
    publisher: '',
    price: '',
    isbn13: '',
  });

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    setListError('');
    const { data, error } = await supabase
      .from('book_purchases')
      .select('*')
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
    if (!form.aladin_url.trim() || !form.requester_name || !form.purchase_date) {
      setFormError('링크, 이름, 구매일을 입력해주세요.');
      return;
    }

    const payload = {
      requester_name: form.requester_name,
      purchase_date: form.purchase_date,
      aladin_url: form.aladin_url.trim(),
      title: form.title.trim() || null,
      author: form.author.trim() || null,
      publisher: form.publisher.trim() || null,
      price: priceValue || null,
      isbn13: form.isbn13.trim() || null,
    };

    const { error } = await supabase.from('book_purchases').insert([payload]);
    if (error) {
      console.error(error);
      setFormError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
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
    });
    setMonthlyTotal(null);
    fetchPurchases();
  };

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
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.aladin_url}
                    onChange={(e) => setForm((prev) => ({ ...prev, aladin_url: e.target.value }))}
                    className="flex-1 h-11 px-3 border border-[--border] rounded-xl bg-white text-sm"
                    placeholder="https://www.aladin.co.kr/..."
                  />
                  <button
                    type="button"
                    onClick={handleLookup}
                    className="btn-primary px-4 h-11 rounded-xl text-sm"
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
                  <label className="block text-sm font-medium text-[--gray-700] mb-1">가격</label>
                  <input
                    type="text"
                    value={formatAmount(form.price)}
                    onChange={(e) => setForm((prev) => ({ ...prev, price: parseAmount(e.target.value) }))}
                    className="h-11 w-full px-3 border border-[--border] rounded-xl bg-white text-sm"
                  />
                </div>
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

              <button
                type="button"
                onClick={handleSubmit}
                className="btn-primary w-full h-11 rounded-xl text-sm"
              >
                저장
              </button>
            </div>
          </div>

          <div className="bg-white border border-[--border] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">도서 신청 목록</h2>
              <span className="text-xs text-[--gray-500]">{purchases.length}건</span>
            </div>
            {listError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {listError}
              </div>
            )}
            {loading ? (
              <div className="text-sm text-[--gray-500]">불러오는 중...</div>
            ) : purchases.length === 0 ? (
              <div className="text-sm text-[--gray-500]">등록된 도서 신청이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[--gray-500] uppercase border-b border-[--border]">
                    <tr>
                      <th className="py-2 text-left">구매일</th>
                      <th className="py-2 text-left">이름</th>
                      <th className="py-2 text-left">도서 정보</th>
                      <th className="py-2 text-right">가격</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => (
                      <tr key={purchase.id} className="border-b border-[--border]">
                        <td className="py-3">{purchase.purchase_date}</td>
                        <td className="py-3 font-medium">{purchase.requester_name}</td>
                        <td className="py-3">
                          <div className="font-medium text-[--foreground]">{purchase.title || '제목 없음'}</div>
                          <div className="text-xs text-[--gray-500]">
                            {purchase.author || '-'} · {purchase.publisher || '-'}
                          </div>
                          <a
                            href={purchase.aladin_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[--gray-500] hover:text-[--primary]"
                          >
                            알라딘 링크
                          </a>
                        </td>
                        <td className="py-3 text-right font-semibold">
                          {purchase.price ? `${purchase.price.toLocaleString()}원` : '-'}
                        </td>
                      </tr>
                    ))}
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
