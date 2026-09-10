// 프로젝트 엑셀 내보내기에서 고를 수 있는 열 정의.
// 내보내기 모달(체크박스)과 서버의 시트 생성이 같은 목록을 봐야 하므로 여기 모아 둔다.

export type ExportColumn = {
  key: string;
  label: string;
  width: number;
  group: string;
  /** 개인정보 — 기본적으로 꺼두고 모달에서 따로 경고한다 */
  sensitive?: boolean;
  defaultOn: boolean;
  /** 숫자 서식(천단위 구분)을 적용할 열 */
  numeric?: boolean;
};

export const PAYMENT_COLUMNS: ExportColumn[] = [
  { key: 'created_at', label: '등록일', width: 18, group: '기본', defaultOn: true },
  { key: 'item', label: '항목', width: 18, group: '기본', defaultOn: true },
  { key: 'recipient', label: '수령인', width: 12, group: '기본', defaultOn: true },
  { key: 'company_name', label: '업체명', width: 18, group: '기본', defaultOn: true },
  { key: 'staff_type', label: '스탭구분', width: 14, group: '기본', defaultOn: true },
  { key: 'payment_method', label: '지급방식', width: 12, group: '기본', defaultOn: true },

  { key: 'currency', label: '통화', width: 8, group: '금액', defaultOn: true },
  { key: 'supply_amount', label: '공급가', width: 14, group: '금액', defaultOn: true, numeric: true },
  { key: 'actual_amount', label: '실지급액', width: 14, group: '금액', defaultOn: true, numeric: true },

  { key: 'bank_name', label: '은행', width: 12, group: '계좌·개인정보', defaultOn: true },
  { key: 'account_number', label: '계좌번호', width: 20, group: '계좌·개인정보', defaultOn: false, sensitive: true },
  { key: 'resident_number', label: '주민등록번호', width: 18, group: '계좌·개인정보', defaultOn: false, sensitive: true },

  { key: 'invoice_date', label: '세금계산서 발행일', width: 18, group: '일정·상태', defaultOn: true },
  { key: 'payment_date', label: '지급일', width: 14, group: '일정·상태', defaultOn: true },
  { key: 'payment_status', label: '상태', width: 10, group: '일정·상태', defaultOn: true },

  { key: 'memo', label: '메모', width: 30, group: '기타', defaultOn: true },
];

export const EXPENSE_COLUMNS: ExportColumn[] = [
  { key: 'expense_number', label: '지출번호', width: 10, group: '기본', defaultOn: false },
  { key: 'expense_date', label: '사용일', width: 14, group: '기본', defaultOn: true },
  { key: 'created_at', label: '등록일', width: 18, group: '기본', defaultOn: true },
  { key: 'type', label: '구분', width: 10, group: '기본', defaultOn: true },
  { key: 'vendor', label: '업체명', width: 20, group: '기본', defaultOn: true },
  { key: 'description', label: '내용', width: 26, group: '기본', defaultOn: true },
  { key: 'note', label: '비고', width: 26, group: '기본', defaultOn: true },

  { key: 'currency', label: '통화', width: 8, group: '금액', defaultOn: true },
  { key: 'amount', label: '금액', width: 14, group: '금액', defaultOn: true, numeric: true },

  { key: 'card_alias', label: '카드명', width: 14, group: '카드·계좌', defaultOn: true },
  { key: 'card_last4', label: '카드끝4', width: 10, group: '카드·계좌', defaultOn: true },
  { key: 'payer_name', label: '지출자', width: 12, group: '카드·계좌', defaultOn: true },
  { key: 'payer_bank_name', label: '은행', width: 12, group: '카드·계좌', defaultOn: true },
  { key: 'payer_account_number', label: '계좌번호', width: 20, group: '카드·계좌', defaultOn: false, sensitive: true },

  { key: 'payment_status', label: '상태', width: 10, group: '일정·상태', defaultOn: true },
  { key: 'payment_date', label: '지급일', width: 14, group: '일정·상태', defaultOn: true },
];

export const defaultSelectedKeys = (columns: ExportColumn[]) =>
  columns.filter((c) => c.defaultOn).map((c) => c.key);

export const groupsOf = (columns: ExportColumn[]) => {
  const seen: string[] = [];
  columns.forEach((c) => {
    if (!seen.includes(c.group)) seen.push(c.group);
  });
  return seen;
};
