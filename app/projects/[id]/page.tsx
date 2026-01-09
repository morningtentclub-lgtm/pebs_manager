'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Project, Payment, Expense, ExpenseCard, StaffType, PaymentMethod } from '@/lib/types';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

export default function ProjectDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;

  type RecipientCandidate = {
    id: string;
    recipient: string | null;
    company_name: string | null;
    item: string | null;
    bank_name: string | null;
    account_number: string | null;
    resident_number: string | null;
    payment_method_id: number | null;
    staff_type_id: number | null;
    created_at: string | null;
    source: 'template' | 'history';
  };

  const [project, setProject] = useState<Project | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCards, setExpenseCards] = useState<ExpenseCard[]>([]);
  const [staffTypes, setStaffTypes] = useState<StaffType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [activeTab, setActiveTab] = useState<'payments' | 'expenses'>('payments');
  const [loading, setLoading] = useState(true);
  const [paymentSortMode, setPaymentSortMode] = useState<'updated' | 'method' | 'staff' | 'amount'>('updated');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [customBankName, setCustomBankName] = useState('');
  const [useCustomBank, setUseCustomBank] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showProjectEditForm, setShowProjectEditForm] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', client: '' });
  const [paymentErrors, setPaymentErrors] = useState<{
    recipient?: boolean;
    staff_type_id?: boolean;
    item?: boolean;
    amount?: boolean;
    payment_method_id?: boolean;
    account_number?: boolean;
    resident_number?: boolean;
  }>({});

  const emptyPayment = {
    recipient: '',
    company_name: '',
    item: '',
    amount: '',
    payment_method_id: null as number | null,
    staff_type_id: null as number | null,
    bank_name: '',
    account_number: '',
    resident_number: '',
    invoice_date: '',
    payment_date: '',
    memo: '',
    id_card_image: null as File | null,
    bankbook_image: null as File | null,
    id_card_url: '',
    bankbook_url: ''
  };

  const [newPayment, setNewPayment] = useState(() => ({ ...emptyPayment }));

  const [newExpense, setNewExpense] = useState({
    expense_number: null as number | null,
    expense_date: '',
    amount: '',
    vendor: '',
    description: '',
    note: '',
    is_company_expense: true,
    card_id: null as string | null,
    card_last4: '',
    card_alias: '',
    payer_name: '',
    payer_bank_name: '',
    payer_account_number: '',
    payment_status: 'completed' as 'pending' | 'completed',
  });
  const [selectedExpenseCardId, setSelectedExpenseCardId] = useState('');
  const [newCardLast4, setNewCardLast4] = useState('');
  const [newCardAlias, setNewCardAlias] = useState('');
  const NEW_CARD_OPTION = '__new_card__';
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardLast4, setEditingCardLast4] = useState('');
  const [editingCardAlias, setEditingCardAlias] = useState('');

  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrFiles, setOcrFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [ocrWarnings, setOcrWarnings] = useState<string[]>([]);
  const ocrFilesRef = useRef(ocrFiles);
  const [recipientMatches, setRecipientMatches] = useState<RecipientCandidate[]>([]);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [recipientLookupLoading, setRecipientLookupLoading] = useState(false);
  const recipientLookupTimerRef = useRef<number | null>(null);
  const recipientQueryRef = useRef('');
  const editPaymentHandledRef = useRef<string | null>(null);

  // 금액 포맷팅 함수
  const formatAmount = (value: string) => {
    const number = value.replace(/[^0-9]/g, '');
    if (!number) return '';
    return Number(number).toLocaleString('ko-KR');
  };

  const parseAmount = (value: string) => {
    return value.replace(/[^0-9]/g, '');
  };

  const formatAccountPreview = (value: string | null) => {
    if (!value) return '';
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length <= 4) return digits;
    return `****${digits.slice(-4)}`;
  };

  const formatResidentPreview = (value: string | null) => {
    if (!value) return '';
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length < 7) return digits;
    return `${digits.slice(0, 6)}-*******`;
  };

  const paymentMethodById = new Map(paymentMethods.map((pm) => [pm.id, pm.name]));
  const staffTypeById = new Map(staffTypes.map((st) => [st.id, st.name]));
  const staffTypeOptions = useMemo(() => {
    const filtered = staffTypes.filter((st) => st.name !== '케이터링');
    const others = filtered.filter((st) => st.name !== '기타');
    const etc = filtered.filter((st) => st.name === '기타');
    return [...others, ...etc];
  }, [staffTypes]);
  const selectedStaffTypeName = newPayment.staff_type_id
    ? staffTypeById.get(newPayment.staff_type_id) || ''
    : '';
  const selectedPaymentMethodName = newPayment.payment_method_id
    ? paymentMethodById.get(newPayment.payment_method_id) || ''
    : '';
  const requiresResidentNumber = selectedPaymentMethodName === '원천징수';

  const bankOptions = [
    '국민은행',
    '신한은행',
    '우리은행',
    '하나은행',
    '농협은행',
    '기업은행',
    '카카오뱅크',
    '토스뱅크',
    '케이뱅크',
    'SC제일은행',
    '씨티은행',
    '산업은행',
    '수협은행',
    'iM뱅크',
    '부산은행',
    '광주은행',
    '제주은행',
    '새마을금고',
    '신협',
    '저축은행',
    '산림조합',
    '우체국',
  ];
  const CUSTOM_BANK_OPTION = '__custom__';
  const isKnownBank = newPayment.bank_name ? bankOptions.includes(newPayment.bank_name) : false;
  const selectedBankValue = useCustomBank || (newPayment.bank_name && !isKnownBank)
    ? CUSTOM_BANK_OPTION
    : (newPayment.bank_name || '');
  const bankAccountLengths: Record<string, number[]> = {
    '산업은행': [11, 14],
    '기업은행': [10, 11, 12, 14],
    '국민은행': [9, 10, 12, 14],
    '수협은행': [11, 12, 14],
    '농협은행': [13, 14],
    '우리은행': [11, 12, 13, 14],
    'SC제일은행': [11, 14],
    '씨티은행': [10, 11, 12, 13],
    'iM뱅크': [11, 12, 13, 14],
    '부산은행': [12, 13],
    '광주은행': [12, 13],
    '제주은행': [10, 12],
    '새마을금고': [13, 14],
    '신협': [12, 13],
    '저축은행': [11, 14],
    '산림조합': [11, 12, 13],
    '우체국': [12, 13, 14],
    '하나은행': [11, 12, 14],
    '신한은행': [11, 12, 13, 14],
    '케이뱅크': [12],
    '카카오뱅크': [13],
    '토스뱅크': [12, 14],
  };
  const accountDigits = newPayment.account_number.replace(/[^0-9]/g, '');
  const allowedAccountLengths = newPayment.bank_name ? bankAccountLengths[newPayment.bank_name] : undefined;
  const accountLengthWarning = allowedAccountLengths && accountDigits.length > 0 && !allowedAccountLengths.includes(accountDigits.length)
    ? `${newPayment.bank_name} 계좌번호는 ${allowedAccountLengths.join('/')}자리입니다. (현재 ${accountDigits.length}자리)`
    : '';

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const targetId = searchParams.get('editPayment');
    if (!targetId || editPaymentHandledRef.current === targetId) {
      return;
    }
    const targetPayment = payments.find((payment) => payment.id === targetId);
    if (!targetPayment) {
      return;
    }
    editPaymentHandledRef.current = targetId;
    openPaymentEditForm(targetPayment);
  }, [payments, searchParams]);

  const revokePreviewUrls = (entries: { previewUrl: string }[]) => {
    entries.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
  };

  const addOcrFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (files.length > 0 && imageFiles.length === 0) {
      alert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    if (imageFiles.length > 0) {
      setNewPayment((prev) => ({
        ...prev,
        resident_number: '',
        bank_name: '',
        account_number: '',
        id_card_url: '',
        bankbook_url: ''
      }));
      setOcrWarnings([]);
    }

    const maxFiles = 10;
    setOcrFiles((prev) => {
      const remaining = Math.max(0, maxFiles - prev.length);
      const nextFiles = imageFiles.slice(0, remaining).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      if (imageFiles.length > remaining) {
        alert(`최대 ${maxFiles}장까지 업로드할 수 있습니다.`);
      }
      return [...prev, ...nextFiles];
    });
  };

  const clearOcrFiles = () => {
    setOcrFiles((prev) => {
      revokePreviewUrls(prev);
      return [];
    });
    setOcrWarnings([]);
    setPreviewImage(null);
  };

  const removeOcrFile = (index: number) => {
    setOcrFiles((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
        if (previewImage?.url === removed.previewUrl) {
          setPreviewImage(null);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    ocrFilesRef.current = ocrFiles;
  }, [ocrFiles]);

  useEffect(() => {
    return () => {
      revokePreviewUrls(ocrFilesRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showPaymentForm) return;

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const imageFiles = Array.from(items)
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (imageFiles.length === 0) return;
      event.preventDefault();
      addOcrFiles(imageFiles);
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [showPaymentForm]);

  useEffect(() => {
    if (!showPaymentForm) {
      setPreviewImage(null);
    }
  }, [showPaymentForm]);

  useEffect(() => {
    if (!showPaymentForm) return;

    const query = newPayment.recipient.trim();
    recipientQueryRef.current = query;

    if (recipientLookupTimerRef.current) {
      window.clearTimeout(recipientLookupTimerRef.current);
    }

    if (query.length < 2) {
      setRecipientMatches([]);
      setRecipientPickerOpen(false);
      setRecipientLookupLoading(false);
      return;
    }

    recipientLookupTimerRef.current = window.setTimeout(async () => {
      setRecipientLookupLoading(true);
      try {
        const [{ data: paymentData, error: paymentError }, { data: templateData, error: templateError }] =
          await Promise.all([
            supabase
              .from('payments')
              .select(
                'id, recipient, company_name, item, bank_name, account_number, resident_number, payment_method_id, staff_type_id, created_at'
              )
              .ilike('recipient', `%${query}%`)
              .order('created_at', { ascending: false })
              .limit(10),
            supabase
              .from('payment_templates')
              .select(
                'id, recipient, company_name, bank_name, account_number, resident_number, payment_method_id, staff_type_id, created_at'
              )
              .ilike('recipient', `%${query}%`)
              .order('created_at', { ascending: false })
              .limit(10),
          ]);

        if (paymentError) throw paymentError;
        if (templateError) throw templateError;

        if (recipientQueryRef.current !== query) return;

        const historyMatches: RecipientCandidate[] = (paymentData || [])
          .filter((item) => item.recipient)
          .map((item) => ({
            id: item.id,
            recipient: item.recipient ?? null,
            company_name: item.company_name ?? null,
            item: item.item ?? null,
            bank_name: item.bank_name ?? null,
            account_number: item.account_number ?? null,
            resident_number: item.resident_number ?? null,
            payment_method_id: item.payment_method_id ?? null,
            staff_type_id: item.staff_type_id ?? null,
            created_at: item.created_at ?? null,
            source: 'history',
          }));
        const templateMatches: RecipientCandidate[] = (templateData || [])
          .filter((item) => item.recipient)
          .map((item) => ({
            id: item.id,
            recipient: item.recipient ?? null,
            company_name: item.company_name ?? null,
            item: null,
            bank_name: item.bank_name ?? null,
            account_number: item.account_number ?? null,
            resident_number: item.resident_number ?? null,
            payment_method_id: item.payment_method_id ?? null,
            staff_type_id: item.staff_type_id ?? null,
            created_at: item.created_at ?? null,
            source: 'template',
          }));
        const combinedMatches = (() => {
          const map = new Map<string, RecipientCandidate>();
          [...templateMatches, ...historyMatches].forEach((match) => {
            const normalizedAccount = (match.account_number || '').replace(/[^0-9]/g, '');
            const key = normalizedAccount ? `account:${normalizedAccount}` : `row:${match.source}:${match.id}`;
            const existing = map.get(key);
            if (!existing) {
              map.set(key, match);
              return;
            }
            if (existing.source !== 'template' && match.source === 'template') {
              map.set(key, match);
            }
          });
          return Array.from(map.values());
        })();
        const normalized = query.toLowerCase();
        const exactMatches = combinedMatches.filter(
          (item) => (item.recipient || '').trim().toLowerCase() === normalized
        );

        if (exactMatches.length === 1) {
          applyRecipientData(exactMatches[0]);
          setRecipientMatches([]);
          setRecipientPickerOpen(false);
        } else if (exactMatches.length > 1) {
          setRecipientMatches(exactMatches);
          setRecipientPickerOpen(true);
        } else {
          setRecipientMatches([]);
          setRecipientPickerOpen(false);
        }
      } catch (error) {
        console.error('수령인 자동완성 실패:', error);
      } finally {
        if (recipientQueryRef.current === query) {
          setRecipientLookupLoading(false);
        }
      }
    }, 300);

    return () => {
      if (recipientLookupTimerRef.current) {
        window.clearTimeout(recipientLookupTimerRef.current);
      }
    };
  }, [newPayment.recipient, showPaymentForm]);

  const fetchData = async () => {
    try {
      // 프로젝트 정보
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      const normalizedProject = projectData
        ? { ...projectData, status: projectData.status === 'pending' ? 'ongoing' : projectData.status }
        : projectData;
      setProject(normalizedProject);

      // 지급 내역
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData || []);

      // 지출 내역
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .eq('project_id', projectId)
        .order('expense_number', { ascending: true });

      if (expensesError) throw expensesError;
      setExpenses(expensesData || []);

      // 스탭 종류
      const { data: staffTypesData } = await supabase
        .from('staff_types')
        .select('*');
      setStaffTypes(staffTypesData || []);

      // 지급 방식
      const { data: paymentMethodsData } = await supabase
        .from('payment_methods')
        .select('*');
      setPaymentMethods(paymentMethodsData || []);

      // 회사 카드 목록
      const { data: expenseCardData, error: expenseCardError } = await supabase
        .from('expense_cards')
        .select('*')
        .order('created_at', { ascending: false });
      if (expenseCardError) throw expenseCardError;
      setExpenseCards(expenseCardData || []);

    } catch (error) {
      console.error('데이터 불러오기 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const openProjectEditForm = () => {
    if (!project) return;
    setProjectForm({
      name: project.name,
      client: project.client || ''
    });
    setShowProjectEditForm(true);
  };

  const updateProjectInfo = async () => {
    if (!project) return;
    if (!projectForm.name.trim()) return;

    try {
      const { error } = await supabase
        .from('projects')
        .update({
          name: projectForm.name.trim(),
          client: projectForm.client.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', project.id);

      if (error) throw error;
      setShowProjectEditForm(false);
      fetchData();
    } catch (error) {
      console.error('프로젝트 수정 실패:', error);
      alert('프로젝트 수정에 실패했습니다.');
    }
  };

  const deleteProject = async () => {
    if (!project) return;
    if (!confirm('프로젝트를 삭제하시겠습니까? 관련 지급/지출 내역이 남아있을 수 있습니다.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id);

      if (error) throw error;
      alert('프로젝트가 삭제되었습니다.');
      window.location.href = '/';
    } catch (error) {
      console.error('프로젝트 삭제 실패:', error);
      alert('프로젝트 삭제에 실패했습니다. 관련 내역을 먼저 정리했는지 확인해주세요.');
    }
  };

  const requestOcr = async (file: File, accessToken: string) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('type', 'auto');

    const response = await fetch('/api/ocr', {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detailMessage = data.details ? ` (${data.details})` : '';
      const message =
        (data.error ? `${data.error}${detailMessage}` : '') ||
        `OCR 처리 실패 (status ${response.status})`;
      throw new Error(message);
    }

    return data;
  };

  const applyOcrData = (data: {
    residentNumber?: string;
    bankName?: string;
    accountNumber?: string;
    imagePath?: string;
  }) => {
    setNewPayment((prev) => {
      const next = { ...prev };

      if (data.residentNumber && !prev.resident_number) {
        next.resident_number = data.residentNumber;
      }
      if (data.bankName && !prev.bank_name) {
        next.bank_name = data.bankName;
      }
      if (data.accountNumber && !prev.account_number) {
        next.account_number = data.accountNumber;
      }
      if (data.imagePath) {
        if (data.residentNumber && !prev.id_card_url) {
          next.id_card_url = data.imagePath;
        }
        if ((data.bankName || data.accountNumber) && !prev.bankbook_url) {
          next.bankbook_url = data.imagePath;
        }
      }

      return next;
    });
  };

  const applyRecipientData = (payment: RecipientCandidate) => {
    setNewPayment((prev) => ({
      ...prev,
      recipient: payment.recipient || prev.recipient,
      company_name: payment.company_name || '',
      item: payment.item || '',
      bank_name: payment.bank_name || '',
      account_number: payment.account_number || '',
      resident_number: payment.resident_number || '',
      payment_method_id: payment.payment_method_id ?? null,
      staff_type_id: payment.staff_type_id ?? null
    }));
    if (payment.bank_name && !bankOptions.includes(payment.bank_name)) {
      setCustomBankName(payment.bank_name);
      setUseCustomBank(true);
    } else if (payment.bank_name) {
      setCustomBankName('');
      setUseCustomBank(false);
    } else {
      setCustomBankName('');
      setUseCustomBank(false);
    }
    setPaymentErrors((prev) => ({
      ...prev,
      recipient: false,
      account_number: false,
      resident_number: false,
      payment_method_id: false,
      staff_type_id: false,
      item: false,
    }));
  };

  const validatePayment = () => {
    const staffTypeName = newPayment.staff_type_id
      ? staffTypeById.get(newPayment.staff_type_id) || ''
      : '';
    const methodName = newPayment.payment_method_id
      ? paymentMethodById.get(newPayment.payment_method_id) || ''
      : '';
    const needsAccountInfo = methodName !== '' && methodName !== '카드';
    const nextErrors = {
      recipient: !newPayment.recipient.trim(),
      staff_type_id: !newPayment.staff_type_id,
      item: staffTypeName === '기타' && !newPayment.item.trim(),
      amount: !newPayment.amount || Number(newPayment.amount) <= 0,
      payment_method_id: !newPayment.payment_method_id,
      account_number: needsAccountInfo && !newPayment.account_number.trim(),
      resident_number: methodName === '원천징수' && !newPayment.resident_number.trim(),
    };
    const hasError = Object.values(nextErrors).some(Boolean);
    setPaymentErrors(nextErrors);
    return !hasError;
  };

  const getActualAmount = (payment: Payment) => {
    const methodName = payment.payment_method_id
      ? paymentMethodById.get(payment.payment_method_id) || ''
      : '';
    if (methodName === '세금계산서') {
      return Math.round((payment.amount || 0) * 1.1);
    }
    if (methodName === '원천징수') {
      return Math.round((payment.amount || 0) * 0.967);
    }
    return payment.amount || 0;
  };

  const getStaffLabel = (payment: Payment) => {
    const staffName = payment.staff_type_id
      ? staffTypeById.get(payment.staff_type_id) || ''
      : '';
    if (staffName === '기타' && payment.item) {
      return `기타(${payment.item})`;
    }
    return staffName || '-';
  };

  const isOtherStaff = (payment: Payment) => {
    const staffName = payment.staff_type_id
      ? staffTypeById.get(payment.staff_type_id) || ''
      : '';
    return staffName === '기타';
  };

  const sortedPayments = useMemo(() => {
    const list = [...payments];
    const staffCounts = new Map<string, number>();
    list.forEach((payment) => {
      const label = getStaffLabel(payment);
      staffCounts.set(label, (staffCounts.get(label) || 0) + 1);
    });

    const getUpdatedTime = (payment: Payment) =>
      new Date(payment.updated_at || payment.created_at).getTime();
    const getMethodLabel = (payment: Payment) =>
      payment.payment_method_id ? paymentMethodById.get(payment.payment_method_id) || '' : '';

    list.sort((a, b) => {
      switch (paymentSortMode) {
        case 'amount': {
          const diff = (b.amount || 0) - (a.amount || 0);
          return diff !== 0 ? diff : getUpdatedTime(b) - getUpdatedTime(a);
        }
        case 'method': {
          const methodDiff = getMethodLabel(a).localeCompare(getMethodLabel(b), 'ko-KR');
          return methodDiff !== 0 ? methodDiff : getUpdatedTime(b) - getUpdatedTime(a);
        }
        case 'staff': {
          const labelA = getStaffLabel(a);
          const labelB = getStaffLabel(b);
          const otherA = isOtherStaff(a);
          const otherB = isOtherStaff(b);
          if (otherA && !otherB) return 1;
          if (!otherA && otherB) return -1;
          const countDiff = (staffCounts.get(labelB) || 0) - (staffCounts.get(labelA) || 0);
          if (countDiff !== 0) return countDiff;
          const labelDiff = labelA.localeCompare(labelB, 'ko-KR');
          return labelDiff !== 0 ? labelDiff : getUpdatedTime(b) - getUpdatedTime(a);
        }
        case 'updated':
        default:
          return getUpdatedTime(b) - getUpdatedTime(a);
      }
    });

    return list;
  }, [payments, paymentSortMode, paymentMethodById, staffTypeById]);

  const handleOcrRecognition = async () => {
    if (ocrFiles.length === 0) {
      alert('이미지를 먼저 업로드해주세요.');
      return;
    }

    setOcrProcessing(true);
    const errors: string[] = [];
    const warnings: string[] = [];
    setOcrWarnings([]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('로그인이 필요합니다.');
      }

      for (const entry of ocrFiles) {
        try {
          const data = await requestOcr(entry.file, accessToken);
          applyOcrData(data);
          if (data.bankName) {
            if (bankOptions.includes(data.bankName)) {
              setCustomBankName('');
              setUseCustomBank(false);
            } else {
              setCustomBankName(data.bankName);
              setUseCustomBank(true);
            }
          }
          if (data.error) {
            errors.push(data.error);
          }
          if (Array.isArray(data.warnings) && data.warnings.length > 0) {
            data.warnings.forEach((warning: string) => {
              warnings.push(`${entry.file.name}: ${warning}`);
            });
          }
        } catch (error) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : '이미지 처리에 실패했습니다. 수동으로 입력해주세요.';
          errors.push(message);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '이미지 처리에 실패했습니다. 수동으로 입력해주세요.';
      errors.push(message);
    } finally {
      setOcrProcessing(false);
    }

    if (warnings.length > 0) {
      setOcrWarnings(warnings);
    }

    if (errors.length > 0) {
      const suffix = errors.length > 1 ? ` 외 ${errors.length - 1}건` : '';
      alert(`${errors[0]}${suffix}`);
    }
  };

  const createPayment = async () => {
    try {
      if (!validatePayment()) return;
      const { id_card_image, bankbook_image, amount, ...paymentData } = newPayment;
      const staffTypeName = paymentData.staff_type_id
        ? staffTypeById.get(paymentData.staff_type_id) || ''
        : '';
      const payload = {
        project_id: projectId,
        ...paymentData,
        company_name: paymentData.company_name || null,
        item: staffTypeName === '기타' && paymentData.item ? paymentData.item.trim() : null,
        amount: amount ? Number(amount) : 0,
        invoice_date: paymentData.invoice_date || null,
        payment_date: paymentData.payment_date || null,
        id_card_url: paymentData.id_card_url || null,
        bankbook_url: paymentData.bankbook_url || null,
        payment_status: 'pending'
      };

      const { error } = await supabase
        .from('payments')
        .insert([payload]);

      if (error) throw error;

      setShowPaymentForm(false);
      setEditingPaymentId(null);
      setNewPayment({ ...emptyPayment });
      setCustomBankName('');
      setUseCustomBank(false);
      setRecipientMatches([]);
      setRecipientPickerOpen(false);
      setRecipientLookupLoading(false);
      setPaymentErrors({});
      clearOcrFiles();
      fetchData();
    } catch (error) {
      console.error('지급 내역 생성 실패:', error);
    }
  };

  const updatePayment = async () => {
    if (!editingPaymentId) return;
    try {
      if (!validatePayment()) return;
      const { id_card_image, bankbook_image, amount, ...paymentData } = newPayment;
      const staffTypeName = paymentData.staff_type_id
        ? staffTypeById.get(paymentData.staff_type_id) || ''
        : '';
      const payload = {
        ...paymentData,
        company_name: paymentData.company_name || null,
        item: staffTypeName === '기타' && paymentData.item ? paymentData.item.trim() : null,
        amount: amount ? Number(amount) : 0,
        invoice_date: paymentData.invoice_date || null,
        payment_date: paymentData.payment_date || null,
        id_card_url: paymentData.id_card_url || null,
        bankbook_url: paymentData.bankbook_url || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('payments')
        .update(payload)
        .eq('id', editingPaymentId);

      if (error) throw error;

      setShowPaymentForm(false);
      setEditingPaymentId(null);
      setNewPayment({ ...emptyPayment });
      setCustomBankName('');
      setUseCustomBank(false);
      setRecipientMatches([]);
      setRecipientPickerOpen(false);
      setRecipientLookupLoading(false);
      setPaymentErrors({});
      clearOcrFiles();
      fetchData();
    } catch (error) {
      console.error('지급 내역 수정 실패:', error);
    }
  };

  const createExpense = async () => {
    try {
      const { amount } = newExpense;
      const isCompanyExpense = newExpense.is_company_expense;
      const payload = {
        project_id: projectId,
        expense_number: newExpense.expense_number,
        expense_date: newExpense.expense_date || null,
        amount: amount ? Number(amount) : 0,
        vendor: newExpense.vendor || null,
        description: newExpense.description || null,
        note: newExpense.note || null,
        is_company_expense: isCompanyExpense,
        card_id: isCompanyExpense ? newExpense.card_id : null,
        card_last4: isCompanyExpense ? (newExpense.card_last4 || null) : null,
        card_alias: isCompanyExpense ? (newExpense.card_alias || null) : null,
        payer_name: !isCompanyExpense ? (newExpense.payer_name || null) : null,
        payer_bank_name: !isCompanyExpense ? (newExpense.payer_bank_name || null) : null,
        payer_account_number: !isCompanyExpense ? (newExpense.payer_account_number || null) : null,
        payment_status: isCompanyExpense ? 'completed' : newExpense.payment_status,
      };

      const { error } = await supabase
        .from('expenses')
        .insert([payload]);

      if (error) {
        const detailParts = [error.message, error.details, error.hint, error.code].filter(Boolean);
        const detail = detailParts.length > 0 ? detailParts.join(' ') : '';
        throw new Error(detail || '지출 내역 생성 실패');
      }

      setShowExpenseForm(false);
      setNewExpense({
        expense_number: null,
        expense_date: '',
        amount: '',
        vendor: '',
        description: '',
        note: '',
        is_company_expense: true,
        card_id: null,
        card_last4: '',
        card_alias: '',
        payer_name: '',
        payer_bank_name: '',
        payer_account_number: '',
        payment_status: 'completed',
      });
      setSelectedExpenseCardId('');
      setNewCardLast4('');
      setNewCardAlias('');
      fetchData();
    } catch (error) {
      console.error('지출 내역 생성 실패:', error);
      const message = error instanceof Error ? error.message : '';
      const helper = message.includes('column')
        ? ' (컬럼 추가 SQL이 적용되었는지 확인해주세요.)'
        : message.includes('row-level security')
          ? ' (RLS 정책을 확인해주세요.)'
          : '';
      alert(`지출 내역 생성 실패${message ? `: ${message}` : ''}${helper}`);
    }
  };

  const handleExpenseTypeChange = (value: 'company' | 'personal') => {
    const isCompany = value === 'company';
    setNewExpense((prev) => ({
      ...prev,
      is_company_expense: isCompany,
      payment_status: isCompany ? 'completed' : 'pending',
      card_id: isCompany ? prev.card_id : null,
      card_last4: isCompany ? prev.card_last4 : '',
      card_alias: isCompany ? prev.card_alias : '',
      payer_name: isCompany ? '' : prev.payer_name,
      payer_bank_name: isCompany ? '' : prev.payer_bank_name,
      payer_account_number: isCompany ? '' : prev.payer_account_number,
    }));
    if (!isCompany) {
      setSelectedExpenseCardId('');
      setNewCardLast4('');
      setNewCardAlias('');
    }
  };

  const handleExpenseCardChange = (value: string) => {
    setSelectedExpenseCardId(value);
    if (value === NEW_CARD_OPTION) {
      setNewExpense((prev) => ({
        ...prev,
        card_id: null,
        card_last4: newCardLast4,
        card_alias: newCardAlias,
      }));
      return;
    }
    const selected = expenseCards.find((card) => card.id === value);
    if (selected) {
      setNewExpense((prev) => ({
        ...prev,
        card_id: selected.id,
        card_last4: selected.card_last4,
        card_alias: selected.card_alias,
      }));
      setNewCardLast4('');
      setNewCardAlias('');
    } else {
      setNewExpense((prev) => ({
        ...prev,
        card_id: null,
        card_last4: '',
        card_alias: '',
      }));
    }
  };

  const registerExpenseCard = async () => {
    const last4 = newCardLast4.replace(/[^0-9]/g, '');
    if (last4.length !== 4) {
      alert('카드 번호는 뒤 4자리만 입력해주세요.');
      return;
    }
    if (!newCardAlias.trim()) {
      alert('카드 별명을 입력해주세요.');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('expense_cards')
        .insert([{ card_last4: last4, card_alias: newCardAlias.trim() }])
        .select('*')
        .single();

      if (error) throw error;

      setExpenseCards((prev) => [data, ...prev]);
      setSelectedExpenseCardId(data.id);
      setNewExpense((prev) => ({
        ...prev,
        card_id: data.id,
        card_last4: data.card_last4,
        card_alias: data.card_alias,
      }));
      setNewCardLast4('');
      setNewCardAlias('');
    } catch (error) {
      console.error('카드 등록 실패:', error);
      alert('카드 등록에 실패했습니다.');
    }
  };

  const startEditExpenseCard = (card: ExpenseCard) => {
    setEditingCardId(card.id);
    setEditingCardLast4(card.card_last4);
    setEditingCardAlias(card.card_alias);
  };

  const cancelEditExpenseCard = () => {
    setEditingCardId(null);
    setEditingCardLast4('');
    setEditingCardAlias('');
  };

  const saveExpenseCard = async () => {
    if (!editingCardId) return;
    const last4 = editingCardLast4.replace(/[^0-9]/g, '');
    if (last4.length !== 4) {
      alert('카드 번호는 뒤 4자리만 입력해주세요.');
      return;
    }
    if (!editingCardAlias.trim()) {
      alert('카드 별명을 입력해주세요.');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('expense_cards')
        .update({ card_last4: last4, card_alias: editingCardAlias.trim() })
        .eq('id', editingCardId)
        .select('*')
        .single();

      if (error) throw error;

      setExpenseCards((prev) => prev.map((card) => (card.id === data.id ? data : card)));
      if (selectedExpenseCardId === data.id) {
        setNewExpense((prev) => ({
          ...prev,
          card_id: data.id,
          card_last4: data.card_last4,
          card_alias: data.card_alias,
        }));
      }
      cancelEditExpenseCard();
    } catch (error) {
      console.error('카드 수정 실패:', error);
      alert('카드 수정에 실패했습니다.');
    }
  };

  const deleteExpenseCard = async (card: ExpenseCard) => {
    if (!confirm('카드를 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase
        .from('expense_cards')
        .delete()
        .eq('id', card.id);
      if (error) throw error;

      setExpenseCards((prev) => prev.filter((item) => item.id !== card.id));
      if (selectedExpenseCardId === card.id) {
        setSelectedExpenseCardId('');
        setNewExpense((prev) => ({
          ...prev,
          card_id: null,
          card_last4: '',
          card_alias: '',
        }));
      }
      if (editingCardId === card.id) {
        cancelEditExpenseCard();
      }
    } catch (error) {
      console.error('카드 삭제 실패:', error);
      alert('카드 삭제에 실패했습니다.');
    }
  };

  const openPaymentEditForm = (payment: Payment) => {
    setEditingPaymentId(payment.id);
    if (payment.bank_name && !bankOptions.includes(payment.bank_name)) {
      setCustomBankName(payment.bank_name);
      setUseCustomBank(true);
    } else {
      setCustomBankName('');
      setUseCustomBank(false);
    }
    setNewPayment({
      recipient: payment.recipient || '',
      company_name: payment.company_name || '',
      item: payment.item || '',
      amount: payment.amount ? String(payment.amount) : '',
      payment_method_id: payment.payment_method_id ?? null,
      staff_type_id: payment.staff_type_id ?? null,
      bank_name: payment.bank_name || '',
      account_number: payment.account_number || '',
      resident_number: payment.resident_number || '',
      invoice_date: payment.invoice_date || '',
      payment_date: payment.payment_date || '',
      memo: payment.memo || '',
      id_card_image: null,
      bankbook_image: null,
      id_card_url: payment.id_card_url || '',
      bankbook_url: payment.bankbook_url || ''
    });
    setPaymentErrors({});
    setRecipientMatches([]);
    setRecipientPickerOpen(false);
    setRecipientLookupLoading(false);
    clearOcrFiles();
    setPreviewImage(null);
    setShowPaymentForm(true);
  };

  const deletePayment = async (paymentId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentId);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('삭제 실패:', error);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('삭제 실패:', error);
    }
  };

  const updateProjectStatus = async (status: 'ongoing' | 'completed') => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', projectId);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('상태 변경 실패:', error);
    }
  };

  const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#1D32FB' }}></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>프로젝트를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-shell">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-[14px] text-gray-600 hover:text-black mb-4 font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            프로젝트 목록으로
          </Link>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mt-2">
            <div>
              <h1 className="text-[32px] font-bold mb-2 tracking-tight">
                {project.name}
              </h1>
              {project.client && (
                <div className="flex items-center gap-2 text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-[14px] font-medium">{project.client}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={project.status}
                onChange={(e) => updateProjectStatus(e.target.value as 'ongoing' | 'completed')}
                className="px-4 py-2 text-[14px] border border-gray-200 rounded-lg focus:outline-none focus:border-black transition-all font-semibold bg-white"
              >
                <option value="ongoing">진행중</option>
                <option value="completed">완료</option>
              </select>
              <button
                onClick={openProjectEditForm}
                className="px-4 py-2 text-[14px] bg-white border border-gray-200 text-gray-700 font-semibold rounded-lg hover:border-black transition-all"
              >
                수정
              </button>
              <button
                onClick={deleteProject}
                className="px-4 py-2 text-[14px] bg-white border border-red-200 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-all"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-[--border] p-6 shadow-sm">
            <div className="text-[13px] text-gray-500 font-medium mb-2">총 지급액</div>
            <div className="text-[28px] font-bold text-gray-900">
              {totalPayments.toLocaleString()}원
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[--border] p-6 shadow-sm">
            <div className="text-[13px] text-gray-500 font-medium mb-2">총 지출액</div>
            <div className="text-[28px] font-bold text-gray-900">
              {totalExpenses.toLocaleString()}원
            </div>
          </div>
        </div>

        {/* Tabs with modern design */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex gap-2 p-2">
              <button
                onClick={() => setActiveTab('payments')}
                className={`flex-1 px-6 py-3.5 text-[14px] font-semibold rounded-lg transition-all ${
                  activeTab === 'payments'
                    ? 'text-white bg-black border border-black'
                    : 'text-gray-600 bg-white border border-gray-200 hover:border-black'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  지급 내역 ({payments.length})
                </span>
              </button>
              <button
                onClick={() => setActiveTab('expenses')}
                className={`flex-1 px-6 py-3.5 text-[14px] font-semibold rounded-lg transition-all ${
                  activeTab === 'expenses'
                    ? 'text-white bg-black border border-black'
                    : 'text-gray-600 bg-white border border-gray-200 hover:border-black'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  지출 내역서 ({expenses.length})
                </span>
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'payments' && (
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h2 className="text-[20px] font-bold text-gray-900">지급 내역</h2>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-gray-600 font-semibold">정렬</span>
                      <select
                        value={paymentSortMode}
                        onChange={(e) => setPaymentSortMode(e.target.value as 'updated' | 'method' | 'staff' | 'amount')}
                        className="px-3 py-2 text-[14px] border border-gray-200 rounded-lg focus:outline-none focus:border-black transition-all font-semibold bg-white"
                      >
                        <option value="updated">업데이트순</option>
                        <option value="method">지급 방식별</option>
                        <option value="staff">항목별</option>
                        <option value="amount">금액 높은순</option>
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        setEditingPaymentId(null);
                        setNewPayment({ ...emptyPayment });
                        setCustomBankName('');
                        setUseCustomBank(false);
                        setShowPaymentForm(true);
                        setPaymentErrors({});
                        setOcrWarnings([]);
                      }}
                      className="px-5 py-2.5 text-[14px] text-white font-semibold rounded-lg transition-all bg-black hover:bg-gray-800"
                    >
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        지급 항목 추가
                      </span>
                    </button>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <p className="text-center py-12 text-gray-500">지급 내역이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">수령인</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">항목</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">지급방식</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">공급가액</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">실입금액</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">계좌정보</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">지급완료</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedPayments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              <div>{payment.recipient || '-'}</div>
                              {payment.company_name && (
                                <div className="text-xs text-gray-500">{payment.company_name}</div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {getStaffLabel(payment)}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {payment.payment_method_id
                                ? paymentMethodById.get(payment.payment_method_id) || '-'
                                : '-'}
                            </td>
                            <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                              {payment.amount.toLocaleString()}원
                            </td>
                            <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                              {getActualAmount(payment).toLocaleString()}원
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {payment.bank_name && payment.account_number
                                ? `${payment.bank_name} ${payment.account_number}`
                                : '-'}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 text-[12px] font-semibold rounded-full ${
                                  payment.payment_status === 'completed'
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {payment.payment_status === 'completed' ? '완료' : '대기'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => openPaymentEditForm(payment)}
                                  className="px-3 py-1.5 text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 rounded hover:border-black transition-colors"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => deletePayment(payment.id)}
                                  className="px-3 py-1.5 text-[13px] font-semibold text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
                                >
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'expenses' && (
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h2 className="text-[20px] font-bold text-gray-900">지출 내역서</h2>
                  <button
                    onClick={() => {
                      setNewExpense({
                        expense_number: null,
                        expense_date: '',
                        amount: '',
                        vendor: '',
                        description: '',
                        note: '',
                        is_company_expense: true,
                        card_id: null,
                        card_last4: '',
                        card_alias: '',
                        payer_name: '',
                        payer_bank_name: '',
                        payer_account_number: '',
                        payment_status: 'completed',
                      });
                      setSelectedExpenseCardId('');
                      setNewCardLast4('');
                      setNewCardAlias('');
                      cancelEditExpenseCard();
                      setShowExpenseForm(true);
                    }}
                    className="px-5 py-2.5 text-[14px] text-white font-semibold rounded-lg transition-all bg-black hover:bg-gray-800"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      지출 항목 추가
                    </span>
                  </button>
                </div>

                {expenses.length === 0 ? (
                  <p className="text-center py-12 text-gray-500">지출 내역이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">구분</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">업체명</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">내용/비고</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">금액</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">결제/지급정보</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {expenses.map((expense) => (
                          <tr key={expense.id}>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {expense.expense_date ? new Date(expense.expense_date).toLocaleDateString('ko-KR') : '-'}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                expense.is_company_expense ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                              }`}>
                                {expense.is_company_expense ? '회사' : '개인'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">{expense.vendor || '-'}</td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              <div>{expense.description || '-'}</div>
                              {expense.note && (
                                <div className="text-xs text-gray-500">{expense.note}</div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                              {expense.amount.toLocaleString()}원
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {expense.is_company_expense ? (
                                expense.card_last4 || expense.card_alias ? (
                                  <div>
                                    <div>{expense.card_alias || '카드'}</div>
                                    <div className="text-xs text-gray-500">**** {expense.card_last4 || '-'}</div>
                                  </div>
                                ) : (
                                  '-'
                                )
                              ) : (
                                <div>
                                  <div>{expense.payer_name || '-'}</div>
                                  <div className="text-xs text-gray-500">
                                    {expense.payer_bank_name && expense.payer_account_number
                                      ? `${expense.payer_bank_name} ${expense.payer_account_number}`
                                      : '-'}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {expense.is_company_expense
                                ? '완료'
                                : (expense.payment_status === 'completed' ? '완료' : '대기')}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <button
                                onClick={() => deleteExpense(expense.id)}
                                className="px-3 py-1.5 text-[13px] font-semibold text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white text-[--foreground] rounded-2xl border border-[--border] shadow-xl max-w-2xl w-full p-6 sm:p-8 my-8">
            <h2 className="text-xl font-semibold text-[--foreground] mb-4">
              {editingPaymentId ? '지급 항목 수정' : '지급 항목 추가'}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">수령인</label>
                <div className="relative">
                  <input
                    type="text"
                    value={newPayment.recipient}
                    onChange={(e) => {
                      setNewPayment({ ...newPayment, recipient: e.target.value });
                      setPaymentErrors((prev) => ({ ...prev, recipient: false }));
                    }}
                    className={`w-full px-3 py-2.5 border rounded-xl bg-white text-sm placeholder:text-[--gray-500] ${
                      paymentErrors.recipient ? 'border-red-500' : 'border-[--border]'
                    }`}
                    placeholder="이름 입력 시 자동완성"
                  />
                  {recipientLookupLoading && newPayment.recipient.trim().length >= 2 && (
                    <div className="absolute right-3 top-2.5 text-xs text-[--gray-400]">검색중...</div>
                  )}
                  {recipientPickerOpen && recipientMatches.length > 1 && (
                    <div className="absolute z-20 mt-2 w-full bg-white border border-[--border] rounded-xl shadow-lg max-h-64 overflow-y-auto">
                      <div className="px-3 py-2 text-xs text-[--gray-500] border-b border-[--border]">
                        동일한 이름이 여러 건 있습니다. 선택해주세요.
                      </div>
                      {recipientMatches.map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => {
                            applyRecipientData(match);
                            setRecipientMatches([]);
                            setRecipientPickerOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-[--gray-50]"
                        >
                          <div className="text-sm font-medium text-[--foreground]">
                            {match.recipient}
                            {match.company_name && (
                              <span className="ml-2 text-xs text-[--gray-500]">({match.company_name})</span>
                            )}
                          </div>
                          <div className="text-xs text-[--gray-500]">
                            은행 {match.bank_name || '-'} · 계좌 {formatAccountPreview(match.account_number)} ·
                            주민 {formatResidentPreview(match.resident_number)}
                          </div>
                          <div className="text-xs text-[--gray-400]">
                            {match.source === 'template' ? '템플릿' : '최근 내역'} · 지급방식 {paymentMethodById.get(match.payment_method_id || 0) || '-'} ·
                            스탭 {staffTypeById.get(match.staff_type_id || 0) || '-'} ·
                            {match.created_at ? new Date(match.created_at).toLocaleDateString('ko-KR') : '-'}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">회사명</label>
                <input
                  type="text"
                  value={newPayment.company_name}
                  onChange={(e) => setNewPayment({ ...newPayment, company_name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm placeholder:text-[--gray-500]"
                  placeholder="선택"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">항목</label>
                <div className="relative">
                  <select
                    value={newPayment.staff_type_id || ''}
                    onChange={(e) => {
                      const nextId = e.target.value ? Number(e.target.value) : null;
                      const nextName = nextId ? staffTypeById.get(nextId) || '' : '';
                      setNewPayment({
                        ...newPayment,
                        staff_type_id: nextId,
                        item: nextName === '기타' ? newPayment.item : '',
                      });
                      setPaymentErrors((prev) => ({
                        ...prev,
                        staff_type_id: false,
                        item: false,
                      }));
                    }}
                    className={`h-11 w-full px-3 pr-10 border rounded-xl bg-white text-sm appearance-none ${
                      paymentErrors.staff_type_id ? 'border-red-500' : 'border-[--border]'
                    }`}
                  >
                    <option value="">선택하세요</option>
                    {staffTypeOptions.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name === '기타' ? '기타(직접 입력)' : st.name}
                      </option>
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
                {paymentErrors.staff_type_id && (
                  <p className="mt-1 text-xs text-red-600">필수 항목입니다.</p>
                )}
              </div>
              {selectedStaffTypeName === '기타' && (
                <div>
                  <label className="block text-sm font-medium text-[--gray-700] mb-1">기타 항목</label>
                  <input
                    type="text"
                    value={newPayment.item}
                    onChange={(e) => {
                      setNewPayment({ ...newPayment, item: e.target.value });
                      setPaymentErrors((prev) => ({ ...prev, item: false }));
                    }}
                    className={`w-full px-3 py-2.5 border rounded-xl bg-white text-sm placeholder:text-[--gray-500] ${
                      paymentErrors.item ? 'border-red-500' : 'border-[--border]'
                    }`}
                    placeholder="직접 입력"
                  />
                  {paymentErrors.item && (
                    <p className="mt-1 text-xs text-red-600">필수 항목입니다.</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">지급 방식</label>
                <div className="relative">
                  <select
                    value={newPayment.payment_method_id || ''}
                    onChange={(e) => {
                      const nextId = e.target.value ? Number(e.target.value) : null;
                      const nextName = nextId ? paymentMethodById.get(nextId) || '' : '';
                      setNewPayment({ ...newPayment, payment_method_id: nextId });
                      setPaymentErrors((prev) => ({
                        ...prev,
                        payment_method_id: false,
                        account_number: nextName === '카드' ? false : prev.account_number,
                        resident_number: nextName === '원천징수' ? prev.resident_number : false,
                      }));
                    }}
                    className={`h-11 w-full px-3 pr-10 border rounded-xl bg-white text-sm appearance-none ${
                      paymentErrors.payment_method_id ? 'border-red-500' : 'border-[--border]'
                    }`}
                  >
                    <option value="">선택하세요</option>
                    {paymentMethods
                      .filter((pm) => pm.name !== '현금')
                      .map((pm) => (
                        <option key={pm.id} value={pm.id}>{pm.name}</option>
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
                {paymentErrors.payment_method_id && (
                  <p className="mt-1 text-xs text-red-600">필수 항목입니다.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">
                  공급가액 <span className="text-xs text-[--gray-500]">(부가세 제외)</span>
                </label>
                <input
                  type="text"
                  value={formatAmount(newPayment.amount)}
                  onChange={(e) => {
                    setNewPayment({ ...newPayment, amount: parseAmount(e.target.value) });
                    setPaymentErrors((prev) => ({ ...prev, amount: false }));
                  }}
                  className={`w-full px-3 py-2.5 border rounded-xl bg-white text-sm placeholder:text-[--gray-500] ${
                    paymentErrors.amount ? 'border-red-500' : 'border-[--border]'
                  }`}
                  placeholder="1,000,000"
                />
                {paymentErrors.amount && (
                  <p className="mt-1 text-xs text-red-600">필수 항목입니다.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">은행명</label>
                <div className="relative">
                  <select
                    value={selectedBankValue}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      if (nextValue === CUSTOM_BANK_OPTION) {
                        setUseCustomBank(true);
                        setNewPayment({ ...newPayment, bank_name: customBankName });
                      } else {
                        setUseCustomBank(false);
                        setNewPayment({ ...newPayment, bank_name: nextValue });
                      }
                    }}
                    className="h-11 w-full px-3 pr-10 border border-[--border] rounded-xl bg-white text-sm appearance-none"
                  >
                    <option value="">선택하세요</option>
                    {bankOptions.map((bankName) => (
                      <option key={bankName} value={bankName}>{bankName}</option>
                    ))}
                    <option value={CUSTOM_BANK_OPTION}>직접 입력</option>
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
                {selectedBankValue === CUSTOM_BANK_OPTION && (
                  <input
                    type="text"
                    value={customBankName}
                    onChange={(e) => {
                      setUseCustomBank(true);
                      setCustomBankName(e.target.value);
                      setNewPayment({ ...newPayment, bank_name: e.target.value });
                    }}
                    className="mt-2 w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm placeholder:text-[--gray-500]"
                    placeholder="은행명을 직접 입력하세요"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">
                  계좌번호 <span className="text-xs text-[--gray-500]">(숫자만 입력)</span>
                </label>
                <input
                  type="text"
                  value={newPayment.account_number}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setNewPayment({ ...newPayment, account_number: value });
                    setPaymentErrors((prev) => ({ ...prev, account_number: false }));
                  }}
                  className={`w-full px-3 py-2.5 border rounded-xl bg-white text-sm ${
                    paymentErrors.account_number ? 'border-red-500' : 'border-[--border]'
                  }`}
                />
                {paymentErrors.account_number && (
                  <p className="mt-1 text-xs text-red-600">필수 항목입니다.</p>
                )}
                {!paymentErrors.account_number && accountLengthWarning && (
                  <p className="mt-1 text-xs text-amber-600">{accountLengthWarning}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">주민등록번호</label>
                <input
                  type="text"
                  value={newPayment.resident_number}
                  onChange={(e) => {
                    setNewPayment({ ...newPayment, resident_number: e.target.value });
                    setPaymentErrors((prev) => ({ ...prev, resident_number: false }));
                  }}
                  className={`w-full px-3 py-2.5 border rounded-xl bg-white text-sm placeholder:text-[--gray-500] ${
                    paymentErrors.resident_number ? 'border-red-500' : 'border-[--border]'
                  }`}
                  placeholder="원천징수용"
                />
                {paymentErrors.resident_number && (
                  <p className="mt-1 text-xs text-red-600">원천징수 선택 시 필수입니다.</p>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-[--gray-700] mb-2">
                  신분증/통장 업로드 (OCR 자동 인식)
                </label>
                <div
                  className="border border-dashed border-[--border-dark] bg-[--gray-50] rounded-xl p-4 hover:border-[--primary] transition-colors cursor-default"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files || []);
                    addOcrFiles(files);
                  }}
                >
                  <div className="text-sm text-[--gray-600]">
                    <p>드래그&드롭 또는 붙여넣기(Cmd/Ctrl+V)</p>
                    <p className="mt-1 text-xs text-[--gray-500]">여러 장 업로드 가능 (최대 10장)</p>
                    <p className="mt-1 text-xs text-[--gray-500]">미리보기 클릭 시 크게 보기</p>
                  </div>
                  {ocrFiles.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {ocrFiles.map((entry, index) => (
                        <div
                          key={`${entry.file.name}-${index}`}
                          className="border border-[--border] rounded-xl p-2 bg-white"
                        >
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ url: entry.previewUrl, name: entry.file.name })}
                            className="h-20 w-full overflow-hidden rounded-lg cursor-zoom-in"
                          >
                            <img
                              src={entry.previewUrl}
                              alt={entry.file.name}
                              className="h-full w-full object-cover"
                            />
                          </button>
                          <p className="mt-2 text-xs text-[--gray-700] truncate">{entry.file.name}</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeOcrFile(index);
                            }}
                            className="mt-1 text-xs text-[--gray-500] hover:text-[--gray-700]"
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOcrRecognition}
                    disabled={ocrProcessing || ocrFiles.length === 0}
                    className="btn-primary px-4 py-2 rounded-xl text-sm disabled:opacity-60"
                  >
                    {ocrProcessing ? '인식 중...' : '인식'}
                  </button>
                  {ocrFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={clearOcrFiles}
                      className="btn-outline px-4 py-2 rounded-xl text-sm"
                    >
                      전체 제거
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-amber-600">
                  OCR 결과가 정확하지 않을 수 있으니 주민등록번호와 계좌번호는 직접 확인해주세요.
                </p>
                {ocrWarnings.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    <div className="font-semibold">OCR 경고</div>
                    <ul className="mt-1 list-disc list-inside space-y-1">
                      {ocrWarnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-[--gray-700] mb-1">메모</label>
                <textarea
                  value={newPayment.memo}
                  onChange={(e) => setNewPayment({ ...newPayment, memo: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPaymentForm(false);
                  setEditingPaymentId(null);
                  setNewPayment({ ...emptyPayment });
                  setCustomBankName('');
                  setUseCustomBank(false);
                  setRecipientMatches([]);
                  setRecipientPickerOpen(false);
                  setRecipientLookupLoading(false);
                  setPaymentErrors({});
                  setOcrWarnings([]);
                  clearOcrFiles();
                  setPreviewImage(null);
                }}
                className="btn-outline flex-1 px-4 py-2 rounded-xl text-sm"
              >
                취소
              </button>
              <button
                onClick={editingPaymentId ? updatePayment : createPayment}
                className="btn-primary flex-1 px-4 py-2 rounded-xl text-sm"
              >
                {editingPaymentId ? '수정' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProjectEditForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">프로젝트 수정</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">프로젝트명</label>
                <input
                  type="text"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">클라이언트</label>
                <input
                  type="text"
                  value={projectForm.client}
                  onChange={(e) => setProjectForm({ ...projectForm, client: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowProjectEditForm(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={updateProjectInfo}
                className="flex-1 px-4 py-2 text-white font-medium rounded-lg"
                style={{ backgroundColor: '#1D32FB' }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
      {previewImage && (
        <div className="fixed top-4 right-4 bottom-4 w-[320px] sm:w-[380px] lg:w-[420px] bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700 truncate">{previewImage.name}</p>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              닫기
            </button>
          </div>
          <div className="bg-black h-full flex items-center justify-center">
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Expense Form Modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white text-[--foreground] rounded-2xl border border-[--border] shadow-xl max-w-2xl w-full p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-[--foreground] mb-4">지출 항목 추가</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">날짜</label>
                <input
                  type="date"
                  value={newExpense.expense_date}
                  onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">구분</label>
                <div className="relative">
                  <select
                    value={newExpense.is_company_expense ? 'company' : 'personal'}
                    onChange={(e) => handleExpenseTypeChange(e.target.value === 'company' ? 'company' : 'personal')}
                    className="h-11 w-full px-3 pr-10 border border-[--border] rounded-xl bg-white text-sm appearance-none"
                  >
                    <option value="company">회사 지출</option>
                    <option value="personal">개인 지출</option>
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
                <label className="block text-sm font-medium text-[--gray-700] mb-1">금액</label>
                <input
                  type="text"
                  value={formatAmount(newExpense.amount)}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: parseAmount(e.target.value) })}
                  className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm placeholder:text-[--gray-500]"
                  placeholder="1,000,000"
                />
              </div>
              {newExpense.is_company_expense && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-[--gray-700] mb-1">카드 선택</label>
                  <div className="relative">
                    <select
                      value={selectedExpenseCardId}
                      onChange={(e) => handleExpenseCardChange(e.target.value)}
                      className="h-11 w-full px-3 pr-10 border border-[--border] rounded-xl bg-white text-sm appearance-none"
                    >
                      <option value="">선택하세요</option>
                      {expenseCards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.card_alias} (**** {card.card_last4})
                        </option>
                      ))}
                      <option value={NEW_CARD_OPTION}>새 카드 등록</option>
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
              )}
              {newExpense.is_company_expense && expenseCards.length > 0 && (
                <div className="col-span-2 rounded-2xl bg-[--gray-50] p-4">
                  <div className="text-xs font-semibold text-[--gray-600]">등록된 카드</div>
                  <div className="mt-3 space-y-2.5">
                    {expenseCards.map((card) => (
                      <div
                        key={card.id}
                        onClick={() => {
                          if (editingCardId === card.id) return;
                          handleExpenseCardChange(card.id);
                        }}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3.5 py-3 shadow-sm cursor-pointer transition ${
                          selectedExpenseCardId === card.id ? 'ring-1 ring-[--primary]' : ''
                        }`}
                      >
                        {editingCardId === card.id ? (
                          <>
                            <div className="flex flex-1 flex-wrap gap-2">
                              <input
                                type="text"
                                value={editingCardLast4}
                                onChange={(e) => setEditingCardLast4(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                                className="w-24 px-2 py-1.5 border border-[--border] rounded-lg text-sm bg-white"
                                placeholder="0000"
                              />
                              <input
                                type="text"
                                value={editingCardAlias}
                                onChange={(e) => setEditingCardAlias(e.target.value)}
                                className="flex-1 min-w-[120px] px-2 py-1.5 border border-[--border] rounded-lg text-sm bg-white"
                                placeholder="카드 별명"
                              />
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  saveExpenseCard();
                                }}
                                className="text-[--primary] hover:text-[--primary-light]"
                              >
                                저장
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  cancelEditExpenseCard();
                                }}
                                className="text-[--gray-500] hover:text-[--gray-700]"
                              >
                                취소
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm text-[--gray-800]">
                              {card.card_alias} <span className="text-xs text-[--gray-400]">**** {card.card_last4}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startEditExpenseCard(card);
                                }}
                                className="text-[--primary] hover:text-[--primary-light]"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteExpenseCard(card);
                                }}
                                className="text-[--accent] hover:text-[--accent-hover]"
                              >
                                삭제
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {newExpense.is_company_expense && selectedExpenseCardId === NEW_CARD_OPTION && (
                <div className="col-span-2">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
                    <div>
                      <label className="block text-sm font-medium text-[--gray-700] mb-1">카드 번호 뒤 4자리</label>
                      <input
                        type="text"
                        value={newCardLast4}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                          setNewCardLast4(value);
                          setNewExpense((prev) => ({
                            ...prev,
                            card_id: null,
                            card_last4: value,
                          }));
                        }}
                        className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                        placeholder="0000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[--gray-700] mb-1">카드 별명</label>
                      <input
                        type="text"
                        value={newCardAlias}
                        onChange={(e) => {
                          const value = e.target.value;
                          setNewCardAlias(value);
                          setNewExpense((prev) => ({
                            ...prev,
                            card_id: null,
                            card_alias: value,
                          }));
                        }}
                        className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                        placeholder="법인카드 A"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={registerExpenseCard}
                      className="btn-primary h-10 px-4 rounded-xl text-sm"
                    >
                      카드 등록
                    </button>
                  </div>
                </div>
              )}
              {!newExpense.is_company_expense && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[--gray-700] mb-1">지출자명</label>
                    <input
                      type="text"
                      value={newExpense.payer_name}
                      onChange={(e) => setNewExpense({ ...newExpense, payer_name: e.target.value })}
                      className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newExpense.payment_status === 'completed'}
                      onChange={(e) =>
                        setNewExpense({
                          ...newExpense,
                          payment_status: e.target.checked ? 'completed' : 'pending',
                        })
                      }
                      className="h-4 w-4 accent-[--primary]"
                    />
                    <span className="text-sm text-[--gray-700]">지급 완료</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[--gray-700] mb-1">은행명</label>
                    <input
                      type="text"
                      value={newExpense.payer_bank_name}
                      onChange={(e) => setNewExpense({ ...newExpense, payer_bank_name: e.target.value })}
                      className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[--gray-700] mb-1">계좌번호</label>
                    <input
                      type="text"
                      value={newExpense.payer_account_number}
                      onChange={(e) =>
                        setNewExpense({ ...newExpense, payer_account_number: e.target.value.replace(/[^0-9]/g, '') })
                      }
                      className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">업체명</label>
                <input
                  type="text"
                  value={newExpense.vendor}
                  onChange={(e) => setNewExpense({ ...newExpense, vendor: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[--gray-700] mb-1">내용</label>
                <input
                  type="text"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-[--gray-700] mb-1">비고</label>
                <input
                  type="text"
                  value={newExpense.note}
                  onChange={(e) => setNewExpense({ ...newExpense, note: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[--border] rounded-xl bg-white text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowExpenseForm(false);
                  setSelectedExpenseCardId('');
                  setNewCardLast4('');
                  setNewCardAlias('');
                  cancelEditExpenseCard();
                }}
                className="btn-outline flex-1 px-4 py-2 rounded-xl text-sm"
              >
                취소
              </button>
              <button
                onClick={createExpense}
                className="btn-primary flex-1 px-4 py-2 rounded-xl text-sm"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
