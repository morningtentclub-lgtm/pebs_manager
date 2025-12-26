'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Project, Payment, Expense, StaffType, PaymentMethod } from '@/lib/types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SignOutButton from '@/components/SignOutButton';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [staffTypes, setStaffTypes] = useState<StaffType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [activeTab, setActiveTab] = useState<'payments' | 'expenses'>('payments');
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showProjectEditForm, setShowProjectEditForm] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', client: '' });

  const [newPayment, setNewPayment] = useState({
    recipient: '',
    amount: '',
    payment_method_id: null as number | null,
    staff_type_id: null as number | null,
    bank_name: '',
    account_number: '',
    resident_number: '',
    business_registration_number: '',
    invoice_date: '',
    payment_date: '',
    memo: '',
    id_card_image: null as File | null,
    bankbook_image: null as File | null,
    id_card_url: '',
    bankbook_url: ''
  });

  const [newExpense, setNewExpense] = useState({
    expense_number: null as number | null,
    expense_date: '',
    amount: '',
    vendor: '',
    description: '',
    category: '',
    is_company_expense: true
  });

  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrFiles, setOcrFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const ocrFilesRef = useRef(ocrFiles);
  const [recipientMatches, setRecipientMatches] = useState<Payment[]>([]);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [recipientLookupLoading, setRecipientLookupLoading] = useState(false);
  const recipientLookupTimerRef = useRef<number | null>(null);
  const recipientQueryRef = useRef('');

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

  const formatBusinessPreview = (value: string | null) => {
    if (!value) return '';
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length < 5) return digits;
    return `${digits.slice(0, 3)}-**-${digits.slice(-2)}`;
  };

  const paymentMethodById = new Map(paymentMethods.map((pm) => [pm.id, pm.name]));
  const staffTypeById = new Map(staffTypes.map((st) => [st.id, st.name]));

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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
        business_registration_number: '',
        id_card_url: '',
        bankbook_url: ''
      }));
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
        const { data, error } = await supabase
          .from('payments')
          .select(
            'id, recipient, bank_name, account_number, resident_number, payment_method_id, staff_type_id, business_registration_number, created_at'
          )
          .ilike('recipient', `%${query}%`)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        if (recipientQueryRef.current !== query) return;

        const matches = (data || []).filter((item) => item.recipient);
        const normalized = query.toLowerCase();
        const exactMatches = matches.filter(
          (item) => (item.recipient || '').trim().toLowerCase() === normalized
        );

        if (exactMatches.length === 1) {
          applyRecipientData(exactMatches[0] as Payment);
          setRecipientMatches([]);
          setRecipientPickerOpen(false);
        } else if (exactMatches.length > 1) {
          setRecipientMatches(exactMatches as Payment[]);
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
    businessRegistrationNumber?: string;
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
      if (data.businessRegistrationNumber && !prev.business_registration_number) {
        next.business_registration_number = data.businessRegistrationNumber;
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

  const applyRecipientData = (payment: Payment) => {
    setNewPayment((prev) => ({
      ...prev,
      recipient: payment.recipient || prev.recipient,
      bank_name: payment.bank_name || '',
      account_number: payment.account_number || '',
      resident_number: payment.resident_number || '',
      business_registration_number: payment.business_registration_number || '',
      payment_method_id: payment.payment_method_id ?? null,
      staff_type_id: payment.staff_type_id ?? null
    }));
  };

  const handleOcrRecognition = async () => {
    if (ocrFiles.length === 0) {
      alert('이미지를 먼저 업로드해주세요.');
      return;
    }

    setOcrProcessing(true);
    const errors: string[] = [];

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
          if (data.error) {
            errors.push(data.error);
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

    if (errors.length > 0) {
      const suffix = errors.length > 1 ? ` 외 ${errors.length - 1}건` : '';
      alert(`${errors[0]}${suffix}`);
    }
  };

  const createPayment = async () => {
    try {
      const { id_card_image, bankbook_image, amount, ...paymentData } = newPayment;
      const payload = {
        project_id: projectId,
        ...paymentData,
        amount: amount ? Number(amount) : 0,
        invoice_date: paymentData.invoice_date || null,
        payment_date: paymentData.payment_date || null,
        id_card_url: paymentData.id_card_url || null,
        bankbook_url: paymentData.bankbook_url || null,
        business_registration_number: paymentData.business_registration_number || null,
        payment_status: 'pending'
      };

      const { error } = await supabase
        .from('payments')
        .insert([payload]);

      if (error) throw error;

      setShowPaymentForm(false);
      setNewPayment({
        recipient: '',
        amount: '',
        payment_method_id: null,
        staff_type_id: null,
        bank_name: '',
        account_number: '',
        resident_number: '',
        business_registration_number: '',
        invoice_date: '',
        payment_date: '',
        memo: '',
        id_card_image: null,
        bankbook_image: null,
        id_card_url: '',
        bankbook_url: ''
      });
      clearOcrFiles();
      fetchData();
    } catch (error) {
      console.error('지급 내역 생성 실패:', error);
    }
  };

  const createExpense = async () => {
    try {
      const { amount, ...expenseData } = newExpense;
      const payload = {
        project_id: projectId,
        ...expenseData,
        amount: amount ? Number(amount) : 0,
        expense_date: expenseData.expense_date || null
      };

      const { error } = await supabase
        .from('expenses')
        .insert([payload]);

      if (error) throw error;

      setShowExpenseForm(false);
      setNewExpense({
        expense_number: null,
        expense_date: '',
        amount: '',
        vendor: '',
        description: '',
        category: '',
        is_company_expense: true
      });
      fetchData();
    } catch (error) {
      console.error('지출 내역 생성 실패:', error);
    }
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
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #fafbfc 0%, #f0f2ff 50%, #fafbfc 100%)' }}>
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#1D32FB] mb-4 font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            프로젝트 목록으로
          </Link>
          <div className="flex items-start justify-between mt-2">
            <div>
              <h1 className="text-4xl font-bold mb-2" style={{ background: 'linear-gradient(135deg, #1D32FB 0%, #4A5BFF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {project.name}
              </h1>
              {project.client && (
                <div className="flex items-center gap-2 text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm font-medium">{project.client}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <select
                value={project.status}
                onChange={(e) => updateProjectStatus(e.target.value as 'ongoing' | 'completed')}
                className="px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#1D32FB] transition-all font-semibold bg-white"
              >
                <option value="ongoing">진행중</option>
                <option value="completed">완료</option>
              </select>
              <button
                onClick={openProjectEditForm}
                className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all"
              >
                수정
              </button>
              <button
                onClick={deleteProject}
                className="px-4 py-2 bg-red-50 text-red-700 font-semibold rounded-xl hover:bg-red-100 transition-all"
              >
                삭제
              </button>
              <SignOutButton className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-blue-100 hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-600">총 지급액</div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #1D32FB 0%, #4A5BFF 100%)' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-3xl font-bold" style={{ color: '#1D32FB' }}>
              {totalPayments.toLocaleString()}원
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-600">총 지출액</div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md bg-gradient-to-br from-gray-400 to-gray-500">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {totalExpenses.toLocaleString()}원
            </div>
          </div>
        </div>

        {/* Tabs with modern design */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-100">
          <div className="border-b border-gray-200">
            <nav className="flex gap-2 p-2">
              <button
                onClick={() => setActiveTab('payments')}
                className={`flex-1 px-6 py-3.5 text-sm font-semibold rounded-xl transition-all ${
                  activeTab === 'payments'
                    ? 'text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={activeTab === 'payments' ? { background: 'linear-gradient(135deg, #1D32FB 0%, #4A5BFF 100%)' } : {}}
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
                className={`flex-1 px-6 py-3.5 text-sm font-semibold rounded-xl transition-all ${
                  activeTab === 'expenses'
                    ? 'text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={activeTab === 'expenses' ? { background: 'linear-gradient(135deg, #1D32FB 0%, #4A5BFF 100%)' } : {}}
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
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">지급 내역</h2>
                  <button
                    onClick={() => setShowPaymentForm(true)}
                    className="px-5 py-2.5 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #1D32FB 0%, #4A5BFF 100%)' }}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      지급 항목 추가
                    </span>
                  </button>
                </div>

                {payments.length === 0 ? (
                  <p className="text-center py-12 text-gray-500">지급 내역이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">수령인</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">항목</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">지급방식</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">금액</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">계좌정보</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {payments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="px-4 py-4 text-sm text-gray-900">{payment.recipient || '-'}</td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {staffTypes.find(st => st.id === payment.staff_type_id)?.name || '-'}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {paymentMethods.find(pm => pm.id === payment.payment_method_id)?.name || '-'}
                            </td>
                            <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                              {payment.amount.toLocaleString()}원
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {payment.bank_name && payment.account_number
                                ? `${payment.bank_name} ${payment.account_number}`
                                : '-'}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <button
                                onClick={() => deletePayment(payment.id)}
                                className="text-red-600 hover:text-red-800"
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

            {activeTab === 'expenses' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">지출 내역서</h2>
                  <button
                    onClick={() => setShowExpenseForm(true)}
                    className="px-5 py-2.5 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #1D32FB 0%, #4A5BFF 100%)' }}
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
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">번호</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">구분</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">업체</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">내역</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">금액</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {expenses.map((expense) => (
                          <tr key={expense.id}>
                            <td className="px-4 py-4 text-sm text-gray-900">{expense.expense_number || '-'}</td>
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
                            <td className="px-4 py-4 text-sm text-gray-900">{expense.description || '-'}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                              {expense.amount.toLocaleString()}원
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <button
                                onClick={() => deleteExpense(expense.id)}
                                className="text-red-600 hover:text-red-800"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 my-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">지급 항목 추가</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">수령인</label>
                <div className="relative">
                  <input
                    type="text"
                    value={newPayment.recipient}
                    onChange={(e) => setNewPayment({ ...newPayment, recipient: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                    placeholder="이름 입력 시 자동완성"
                  />
                  {recipientLookupLoading && newPayment.recipient.trim().length >= 2 && (
                    <div className="absolute right-3 top-2 text-xs text-gray-400">검색중...</div>
                  )}
                  {recipientPickerOpen && recipientMatches.length > 1 && (
                    <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
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
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        >
                          <div className="text-sm font-medium text-gray-900">{match.recipient}</div>
                          <div className="text-xs text-gray-500">
                            은행 {match.bank_name || '-'} · 계좌 {formatAccountPreview(match.account_number)} ·
                            주민 {formatResidentPreview(match.resident_number)} · 사업자 {formatBusinessPreview(match.business_registration_number)}
                          </div>
                          <div className="text-xs text-gray-400">
                            지급방식 {paymentMethodById.get(match.payment_method_id || 0) || '-'} ·
                            스탭 {staffTypeById.get(match.staff_type_id || 0) || '-'} ·
                            {new Date(match.created_at).toLocaleDateString('ko-KR')}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">항목</label>
                <select
                  value={newPayment.staff_type_id || ''}
                  onChange={(e) => setNewPayment({ ...newPayment, staff_type_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                >
                  <option value="">선택하세요</option>
                  {staffTypes.map((st) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">지급 방식</label>
                <select
                  value={newPayment.payment_method_id || ''}
                  onChange={(e) => setNewPayment({ ...newPayment, payment_method_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                >
                  <option value="">선택하세요</option>
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">금액</label>
                <input
                  type="text"
                  value={formatAmount(newPayment.amount)}
                  onChange={(e) => setNewPayment({ ...newPayment, amount: parseAmount(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                  placeholder="1,000,000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">은행명</label>
                <input
                  type="text"
                  value={newPayment.bank_name}
                  onChange={(e) => setNewPayment({ ...newPayment, bank_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  계좌번호 <span className="text-xs text-gray-500">(숫자만 입력)</span>
                </label>
                <input
                  type="text"
                  value={newPayment.account_number}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setNewPayment({ ...newPayment, account_number: value });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                  placeholder="01012345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주민등록번호</label>
                <input
                  type="text"
                  value={newPayment.resident_number}
                  onChange={(e) => setNewPayment({ ...newPayment, resident_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                  placeholder="원천징수용"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  사업자등록번호 <span className="text-xs text-gray-500">(세금계산서 용)</span>
                </label>
                <input
                  type="text"
                  value={newPayment.business_registration_number}
                  onChange={(e) => setNewPayment({ ...newPayment, business_registration_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                  placeholder="000-00-00000"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  신분증/통장/사업자등록증 업로드 (OCR 자동 인식)
                </label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-400 transition-colors cursor-default"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files || []);
                    addOcrFiles(files);
                  }}
                >
                  <div className="text-sm text-gray-600">
                    <p>드래그&드롭 또는 붙여넣기(Cmd/Ctrl+V)</p>
                    <p className="mt-1 text-xs text-gray-400">여러 장 업로드 가능 (최대 10장)</p>
                    <p className="mt-1 text-xs text-gray-400">미리보기 클릭 시 크게 보기</p>
                  </div>
                  {ocrFiles.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {ocrFiles.map((entry, index) => (
                        <div
                          key={`${entry.file.name}-${index}`}
                          className="border border-gray-200 rounded-lg p-2 bg-white"
                        >
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ url: entry.previewUrl, name: entry.file.name })}
                            className="h-20 w-full overflow-hidden rounded cursor-zoom-in"
                          >
                            <img
                              src={entry.previewUrl}
                              alt={entry.file.name}
                              className="h-full w-full object-cover"
                            />
                          </button>
                          <p className="mt-2 text-xs text-gray-700 truncate">{entry.file.name}</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeOcrFile(index);
                            }}
                            className="mt-1 text-xs text-gray-500 hover:text-gray-700"
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
                    className="px-4 py-2 text-white font-medium rounded-lg disabled:opacity-60"
                    style={{ backgroundColor: '#1D32FB' }}
                  >
                    {ocrProcessing ? '인식 중...' : '인식'}
                  </button>
                  {ocrFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={clearOcrFiles}
                      className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
                    >
                      전체 제거
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-amber-600">
                  OCR 결과가 정확하지 않을 수 있으니 주민등록번호, 계좌번호, 사업자등록번호는 직접 확인해주세요.
                </p>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <textarea
                  value={newPayment.memo}
                  onChange={(e) => setNewPayment({ ...newPayment, memo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPaymentForm(false);
                  clearOcrFiles();
                  setPreviewImage(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={createPayment}
                className="flex-1 px-4 py-2 text-white font-medium rounded-lg"
                style={{ backgroundColor: '#1D32FB' }}
              >
                추가
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">지출 항목 추가</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">번호</label>
                <input
                  type="number"
                  value={newExpense.expense_number || ''}
                  onChange={(e) => setNewExpense({ ...newExpense, expense_number: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">날짜</label>
                <input
                  type="date"
                  value={newExpense.expense_date}
                  onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">구분</label>
                <select
                  value={newExpense.is_company_expense ? 'company' : 'personal'}
                  onChange={(e) => setNewExpense({ ...newExpense, is_company_expense: e.target.value === 'company' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                >
                  <option value="company">회사 지출</option>
                  <option value="personal">개인 지출</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">금액</label>
                <input
                  type="text"
                  value={formatAmount(newExpense.amount)}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: parseAmount(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                  placeholder="1,000,000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">업체</label>
                <input
                  type="text"
                  value={newExpense.vendor}
                  onChange={(e) => setNewExpense({ ...newExpense, vendor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                <input
                  type="text"
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">내역</label>
                <input
                  type="text"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowExpenseForm(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={createExpense}
                className="flex-1 px-4 py-2 text-white font-medium rounded-lg"
                style={{ backgroundColor: '#1D32FB' }}
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
