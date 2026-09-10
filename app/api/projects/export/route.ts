import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PAYMENT_COLUMNS, EXPENSE_COLUMNS, ExportColumn } from '@/lib/exportColumns';
import { parsePaymentMemoMeta, resolvePaymentAmounts } from '@/lib/paymentAmount';
import type { Expense, Payment, Project } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_PROJECTS = 50;
const HEADER_ROW = 5;

let supabaseServer: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  }
  if (!supabaseServer) {
    supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseServer;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '';
  return value.includes('T') ? value.slice(0, 10) : value;
}

function statusLabel(value: string | null | undefined) {
  if (value === 'completed') return '완료';
  if (value === 'pending') return '대기';
  return '';
}

/** 계좌·주민번호가 숫자로 뭉개지지 않도록 문자열 그대로 둔다 */
function asText(value: string | null | undefined) {
  return value ? String(value) : '';
}

function moneyFormat(currency: string) {
  return currency === 'USD' ? '$#,##0.00' : '#,##0';
}

type SheetRow = Record<string, string | number | null>;

function buildSheet(
  workbook: ExcelJS.Workbook,
  options: {
    title: string;
    projectName: string;
    client: string;
    columns: ExportColumn[];
    rows: SheetRow[];
    totals: { label: string; byCurrency: Record<string, number> } | null;
  }
) {
  const sheet = workbook.addWorksheet(options.title);
  const { columns, rows } = options;

  sheet.getCell('A1').value = options.projectName;
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A2').value = options.client ? `클라이언트: ${options.client}` : '';
  sheet.getCell('A3').value = `${options.title} ${rows.length}건`;

  const headerRow = sheet.getRow(HEADER_ROW);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F5' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
    sheet.getColumn(index + 1).width = column.width;
  });
  headerRow.commit();

  rows.forEach((row, rowIndex) => {
    const sheetRow = sheet.getRow(HEADER_ROW + 1 + rowIndex);
    columns.forEach((column, index) => {
      const cell = sheetRow.getCell(index + 1);
      const value = row[column.key];
      cell.value = value ?? '';
      if (column.numeric && typeof value === 'number') {
        cell.numFmt = moneyFormat(String(row.currency));
        cell.alignment = { horizontal: 'right' };
      }
    });
    sheetRow.commit();
  });

  // 엑셀에서 바로 정렬·필터할 수 있도록 헤더에 자동필터를 건다
  if (columns.length > 0) {
    sheet.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: HEADER_ROW + rows.length, column: columns.length },
    };
  }
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: HEADER_ROW }];

  if (options.totals) {
    const entries = Object.entries(options.totals.byCurrency).filter(([, sum]) => sum !== 0);
    let cursor = HEADER_ROW + rows.length + 2;
    entries.forEach(([currency, sum]) => {
      const labelCell = sheet.getCell(cursor, 1);
      labelCell.value = `${options.totals!.label} (${currency})`;
      labelCell.font = { bold: true };
      const valueCell = sheet.getCell(cursor, 2);
      valueCell.value = sum;
      valueCell.numFmt = moneyFormat(currency);
      valueCell.font = { bold: true };
      cursor += 1;
    });
  }
}

type ProjectBundle = {
  project: Project;
  payments: Payment[];
  expenses: Expense[];
};

type BuildOptions = {
  wantPayments: boolean;
  wantExpenses: boolean;
  includeTotals: boolean;
  paymentColumns: ExportColumn[];
  expenseColumns: ExportColumn[];
  staffTypeById: Map<number, string>;
  methodById: Map<number, string>;
};

function paymentRows(bundle: ProjectBundle, options: BuildOptions): SheetRow[] {
  return bundle.payments.map((payment) => {
    const methodName = payment.payment_method_id ? options.methodById.get(payment.payment_method_id) || '' : '';
    const staffName = payment.staff_type_id ? options.staffTypeById.get(payment.staff_type_id) || '' : '';
    const { supply, actual } = resolvePaymentAmounts(payment.amount, payment.memo, methodName);
    const { displayMemo } = parsePaymentMemoMeta(payment.memo);
    return {
      created_at: formatDateTime(payment.created_at),
      item: payment.item || '',
      recipient: payment.recipient || '',
      company_name: payment.company_name || '',
      staff_type: staffName === '기타' && payment.item ? `기타(${payment.item})` : staffName,
      payment_method: methodName,
      currency: payment.currency || 'KRW',
      supply_amount: supply,
      actual_amount: actual,
      bank_name: payment.bank_name || '',
      account_number: asText(payment.account_number),
      resident_number: asText(payment.resident_number),
      invoice_date: formatDate(payment.invoice_date),
      payment_date: formatDate(payment.payment_date),
      payment_status: statusLabel(payment.payment_status),
      memo: displayMemo,
    };
  });
}

function expenseRows(bundle: ProjectBundle): SheetRow[] {
  return bundle.expenses.map((expense) => ({
    expense_number: expense.expense_number ?? '',
    expense_date: formatDate(expense.expense_date),
    created_at: formatDateTime(expense.created_at),
    type: expense.is_company_expense ? '회사' : '개인',
    vendor: expense.vendor || '',
    description: expense.description || '',
    note: expense.note || '',
    currency: expense.currency || 'KRW',
    amount: expense.amount || 0,
    card_alias: expense.card_alias || '',
    card_last4: asText(expense.card_last4),
    payer_name: expense.payer_name || '',
    payer_bank_name: expense.payer_bank_name || '',
    payer_account_number: asText(expense.payer_account_number),
    payment_status: statusLabel(expense.payment_status),
    payment_date: formatDate(expense.payment_date),
  }));
}

function sumByCurrency(rows: SheetRow[], amountKey: string) {
  const byCurrency: Record<string, number> = {};
  rows.forEach((row) => {
    const currency = String(row.currency || 'KRW');
    byCurrency[currency] = (byCurrency[currency] || 0) + (Number(row[amountKey]) || 0);
  });
  return byCurrency;
}

async function buildProjectWorkbook(bundle: ProjectBundle, options: BuildOptions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PEBS Desk';
  workbook.created = new Date();

  const projectName = bundle.project.name || '';
  const client = bundle.project.client || '';

  if (options.wantPayments) {
    const rows = paymentRows(bundle, options);
    buildSheet(workbook, {
      title: '지급내역',
      projectName,
      client,
      columns: options.paymentColumns,
      rows,
      totals: options.includeTotals
        ? { label: '실지급액 합계', byCurrency: sumByCurrency(rows, 'actual_amount') }
        : null,
    });
  }

  if (options.wantExpenses) {
    const rows = expenseRows(bundle);
    buildSheet(workbook, {
      title: '지출내역',
      projectName,
      client,
      columns: options.expenseColumns,
      rows,
      totals: options.includeTotals
        ? { label: '지출 합계', byCurrency: sumByCurrency(rows, 'amount') }
        : null,
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'project';
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: '인증에 실패했습니다.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const projectIds: string[] = Array.isArray(body?.projectIds)
      ? body.projectIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];

    if (projectIds.length === 0) {
      return NextResponse.json({ error: '내보낼 프로젝트를 선택해주세요.' }, { status: 400 });
    }
    if (projectIds.length > MAX_PROJECTS) {
      return NextResponse.json(
        { error: `한 번에 최대 ${MAX_PROJECTS}개까지 내보낼 수 있습니다.` },
        { status: 400 }
      );
    }

    const wantPayments = body?.sheets?.payments !== false;
    const wantExpenses = body?.sheets?.expenses !== false;
    const includeTotals = body?.includeTotals !== false;

    if (!wantPayments && !wantExpenses) {
      return NextResponse.json({ error: '내보낼 시트를 하나 이상 선택해주세요.' }, { status: 400 });
    }

    const pickColumns = (all: ExportColumn[], requested: unknown) => {
      if (!Array.isArray(requested)) return all.filter((c) => c.defaultOn);
      const keys = new Set(requested.filter((k): k is string => typeof k === 'string'));
      return all.filter((c) => keys.has(c.key));
    };

    const [projectsResult, paymentsResult, expensesResult, staffTypesResult, methodsResult] = await Promise.all([
      supabase.from('projects').select('*').in('id', projectIds),
      supabase.from('payments').select('*').in('project_id', projectIds).order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').in('project_id', projectIds).order('expense_number', { ascending: true }),
      supabase.from('staff_types').select('*'),
      supabase.from('payment_methods').select('*'),
    ]);

    const projectRows = (projectsResult.data || []) as unknown as Project[];
    if (projectRows.length === 0) {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }

    const allPayments = (paymentsResult.data || []) as unknown as Payment[];
    const allExpenses = (expensesResult.data || []) as unknown as Expense[];

    const options: BuildOptions = {
      wantPayments,
      wantExpenses,
      includeTotals,
      paymentColumns: pickColumns(PAYMENT_COLUMNS, body?.paymentColumns),
      expenseColumns: pickColumns(EXPENSE_COLUMNS, body?.expenseColumns),
      staffTypeById: new Map(
        ((staffTypesResult.data || []) as unknown as { id: number; name: string }[]).map((s) => [s.id, s.name])
      ),
      methodById: new Map(
        ((methodsResult.data || []) as unknown as { id: number; name: string }[]).map((m) => [m.id, m.name])
      ),
    };

    // 요청한 순서를 유지한다 (화면에서 고른 순서 그대로)
    const byId = new Map(projectRows.map((p) => [p.id, p]));
    const bundles: ProjectBundle[] = projectIds
      .map((id) => byId.get(id))
      .filter((project): project is Project => Boolean(project))
      .map((project) => ({
        project,
        payments: allPayments.filter((p) => p.project_id === project.id),
        expenses: allExpenses.filter((e) => e.project_id === project.id),
      }));

    if (bundles.length === 1) {
      const buffer = await buildProjectWorkbook(bundles[0], options);
      const fileName = `${safeFileName(bundles[0].project.name || '')}_지급지출내역.xlsx`;
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const bundle of bundles) {
      const base = `${safeFileName(bundle.project.name || '')}_지급지출내역`;
      let name = `${base}.xlsx`;
      let counter = 2;
      // 같은 이름의 프로젝트가 있어도 파일이 덮어써지지 않게 한다
      while (usedNames.has(name)) {
        name = `${base} (${counter}).xlsx`;
        counter += 1;
      }
      usedNames.add(name);
      zip.file(name, await buildProjectWorkbook(bundle, options));
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const today = new Date().toISOString().slice(0, 10);
    const zipName = `지급지출내역_${bundles.length}개_${today}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '엑셀 생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
